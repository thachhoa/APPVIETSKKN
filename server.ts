import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
// @ts-ignore
import mammoth from "mammoth";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper to clean and parse JSON from Gemini responses (robust for Vercel/prod environments)
function cleanAndParseJson(raw: string) {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  cleaned = cleaned.trim();
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    console.error("JSON parse failure on raw text:", raw);
    // Fallback: search for first '{' and last '}'
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      } catch (innerErr) {
        throw new Error("Could not salvage invalid JSON: " + err.message);
      }
    }
    throw err;
  }
}

// Helper to validate request API Key and get Gemini client dynamically
function getAIClient(req: express.Request) {
  const clientKey = (req.headers['x-gemini-key'] as string) || process.env.GEMINI_API_KEY || "";
  const isMock = !clientKey || clientKey === "MOCK_KEY" || clientKey.trim() === "";
  
  const client = new GoogleGenAI({
    apiKey: isMock ? "MOCK_KEY" : clientKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  return { client, isMock };
}

// Global retry fallback list
const MODEL_FALLBACK_LIST = ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"];

// Helper to call Gemini generateContent with Retry and Fallback models
async function generateContentWithRetry(
  req: express.Request,
  config: {
    contents: any; // String prompt or Array chat history
    systemInstruction?: string;
    responseMimeType?: string;
  }
) {
  const { client, isMock } = getAIClient(req);
  if (isMock) {
    throw new Error("MOCK_KEY");
  }

  // Get selected model from client headers or default
  const userModel = (req.headers['x-gemini-model'] as string) || "gemini-3-flash-preview";

  // Build the model queue starting with the user's selected model
  const modelQueue = [userModel];
  MODEL_FALLBACK_LIST.forEach(model => {
    if (!modelQueue.includes(model)) {
      modelQueue.push(model);
    }
  });

  let lastError: any = null;

  for (let i = 0; i < modelQueue.length; i++) {
    const rawModel = modelQueue[i];
    
    // Map human preview labels to actual working SDK model IDs
    let apiModel = rawModel;
    if (rawModel === "gemini-3-flash-preview") {
      apiModel = "gemini-2.5-flash";
    } else if (rawModel === "gemini-3-pro-preview") {
      apiModel = "gemini-2.5-pro";
    } else if (rawModel === "gemini-2.5-flash") {
      apiModel = "gemini-2.5-flash";
    }

    try {
      console.log(`[AI Retry System] Attempt ${i + 1}/${modelQueue.length}: Trying model ${apiModel} (selected: ${rawModel})`);
      const options: any = {
        model: apiModel,
        contents: config.contents,
      };

      if (config.systemInstruction || config.responseMimeType) {
        options.config = {};
        if (config.systemInstruction) {
          options.config.systemInstruction = config.systemInstruction;
        }
        if (config.responseMimeType) {
          options.config.responseMimeType = config.responseMimeType;
        }
      }

      const response = await client.models.generateContent(options);
      
      if (response && response.text) {
        console.log(`[AI Retry System] SUCCESS with model ${apiModel}`);
        return response.text;
      }
      throw new Error("API returned an empty text content.");
    } catch (err: any) {
      console.warn(`[AI Retry System] FAILED with model ${apiModel}: ${err.message || err}`);
      lastError = err;
      
      // If the error is API Key invalid or similar auth issues, fail immediately instead of retrying
      const errMsg = (err.message || "").toLowerCase();
      if (errMsg.includes("api_key_invalid") || errMsg.includes("invalid api key") || errMsg.includes("key is not valid")) {
        throw new Error("API Key không hợp lệ. Vui lòng kiểm tra lại API Key trong cài đặt.");
      }
    }
  }

  throw lastError || new Error("Tất cả các mô hình AI đều thất bại.");
}

// --- FALLBACK SYSTEM FOR GEMINI OFFLINE / CONFIGURATION ISSUES ---

function fallbackAnalyzeTopic(title: string, subject: string, grade: string, category: string, customOutlineLines?: any[]) {
  const finalSubject = subject || "Giáo dục";
  const finalGrade = grade || "tiểu học/trung học";
  const processedTitle = title.replace(/^(phương pháp|biện pháp|sử dụng|nâng cao|một số|kinh nghiệm|về|với)\s+/i, '');

  let outlines: any[] = [];
  if (customOutlineLines && Array.isArray(customOutlineLines) && customOutlineLines.length > 0) {
    outlines = customOutlineLines.map((item, idx) => {
      let itemTitle = "";
      let itemContent = "";
      if (typeof item === 'object' && item !== null) {
        itemTitle = item.title || "";
        itemContent = item.content || "";
      } else {
        itemTitle = String(item);
      }

      let id = `phan-${idx + 1}`;
      const lower = itemTitle.toLowerCase();
      if (lower.includes("mở đầu") || lower.includes("mo dau")) id = "mo-dau";
      else if (lower.includes("lý luận") || lower.includes("ly luan")) id = "co-so-ly-luan";
      else if (lower.includes("thực trạng") || lower.includes("thuc trang")) id = "thuc-trang";
      else if (lower.includes("giải pháp") || lower.includes("giai phap") || lower.includes("biện pháp") || lower.includes("bien phap")) id = "giai-phap";
      else if (lower.includes("kết quả") || lower.includes("ket qua") || lower.includes("hiệu quả") || lower.includes("hieu qua")) id = "ket-qua";
      else if (lower.includes("kết luận") || lower.includes("ket luan")) id = "ket-luan";

      return {
        id: id,
        title: itemTitle.length > 30 ? itemTitle.substring(0, 27) + "..." : itemTitle,
        vietnameseTitle: itemTitle.startsWith("Phần") || itemTitle.startsWith("Chương") || /^[0-9]/.test(itemTitle) ? itemTitle : `Phần ${idx + 1}: ${itemTitle}`,
        description: `Biên soạn chi tiết nội dung nghiên cứu cho phần "${itemTitle}" bám sát mục tiêu phát triển phẩm chất và năng lực cho học sinh lớp ${finalGrade} đối với môn học ${finalSubject}.`,
        content: itemContent,
        status: itemContent ? 'completed' : 'idle',
        aiSuggestedMetrics: [
          `Mức độ hoàn thành các nhiệm vụ học tập trong phần ${itemTitle}`,
          `Khả năng tự nghiên cứu và tư duy sáng tạo phù hợp với chủ đề`
        ],
        aiSuggestedEvidences: [
          `Bảng đánh giá mức độ hoàn thành hoạt động thực hành thuộc nội dung này`,
          `Hình ảnh minh chứng quá trình học sinh tham gia học tập thực tế`
        ]
      };
    });
  } else {
    outlines = [
      {
        id: "mo-dau",
        title: "Mở đầu",
        vietnameseTitle: "Phần I: Mở đầu",
        description: `Nêu lý do chọn đề tài nghiên cứu liên quan đến môn ${finalSubject} lớp ${finalGrade}, mục đích, đối tượng, phạm vi nghiên cứu và phương pháp triển khai thực hiện đề tài sáng kiến.`,
        aiSuggestedMetrics: [
          "Phiếu khảo sát mức độ hứng thú học tập ban đầu của học sinh",
          "Kết quả đánh giá chất lượng học tập định kỳ trước khi áp dụng đề tài"
        ],
        aiSuggestedEvidences: [
          "Bảng thống kê số liệu khảo sát ý kiến của học sinh trước thực nghiệm",
          "Hình ảnh chụp hoạt động lớp học theo phương pháp truyền thống cũ"
        ]
      },
      {
        id: "co-so-ly-luan",
        title: "Cơ sở lý luận",
        vietnameseTitle: "Phần II: Cơ sở lý luận",
        description: "Trình bày các văn bản chỉ đạo của Bộ Giáo dục và Đào tạo, các nghị quyết, thông tư đổi mới GDPT 2018 và các cơ sở tâm lý học sư phạm liên quan.",
        aiSuggestedMetrics: [
          "Trích dẫn các thông tư hướng dẫn đổi mới kiểm tra, đánh giá học sinh",
          "Các khái niệm cốt lõi về phát triển phẩm chất và năng lực người học"
        ],
        aiSuggestedEvidences: [
          "Hệ thống cơ sở lý thuyết khoa học được sử dụng trong đề tài",
          "Danh mục tài liệu tham khảo chính thống của các chuyên gia giáo dục"
        ]
      },
      {
        id: "thuc-trang",
        title: "Thực trạng",
        vietnameseTitle: "Phần III: Thực trạng vấn đề",
        description: "Phân tích chi tiết thuận lợi, khó khăn tại đơn vị công tác. Thực trạng hứng thú học tập, thái độ và kết quả của học sinh đối với nội dung đề tài.",
        aiSuggestedMetrics: [
          "Số liệu phần trăm học sinh tích cực tham gia bài học (trước áp dụng)",
          "Bảng điểm đánh giá năng lực môn học ban đầu của lớp khảo sát"
        ],
        aiSuggestedEvidences: [
          "Biên bản họp chuyên môn tổ giáo viên nhận xét về thực trạng giảng dạy",
          "Phiếu thu thập thông tin và kết quả khảo sát đầu năm học"
        ]
      },
      {
        id: "giai-phap",
        title: "Các giải pháp thực hiện",
        vietnameseTitle: "Phần IV: Các giải pháp/Biện pháp thực hiện",
        description: `Mô tả chi tiết, khoa học các biện pháp sư phạm cụ thể nhằm nâng cao chất lượng dạy học môn ${finalSubject} lớp ${finalGrade} bám sát nội dung đề tài "${title}".`,
        aiSuggestedMetrics: [
          "Quy trình triển khai chi tiết từng giải pháp (bước 1, bước 2, bước 3)",
          "Cách thức tổ chức hoạt động lớp học tương tác, thảo luận nhóm sáng tạo"
        ],
        aiSuggestedEvidences: [
          "Hệ thống kế hoạch bài dạy (Giáo án mẫu thiết kế theo Công văn 5512)",
          "Hình ảnh học sinh thảo luận, trình bày sản phẩm, tham gia trò chơi tương tác"
        ]
      },
      {
        id: "ket-qua",
        title: "Hiệu quả của sáng kiến",
        vietnameseTitle: "Phần V: Hiệu quả thực tiễn",
        description: "Bảng đối so sánh trực quan kết quả định lượng (điểm số, mức độ đạt chuẩn) và định tính (thái độ, hành vi) trước và sau khi áp dụng sáng kiến.",
        aiSuggestedMetrics: [
          "Tỷ lệ học sinh đạt mức độ Khá - Giỏi tăng lên rõ rệt",
          "Mức độ hào hứng và tích cực tương tác trong giờ học đạt trên 90%"
        ],
        aiSuggestedEvidences: [
          "Bảng số liệu so sánh đối chứng trước và sau khi thực nghiệm biện pháp",
          "Sản phẩm học tập cụ thể của học sinh (bài viết, mô hình, tranh vẽ)"
        ]
      },
      {
        id: "ket-luan",
        title: "Kết luận và kiến nghị",
        vietnameseTitle: "Phần VI: Kết luận và Kiến nghị",
        description: "Bài học kinh nghiệm rút ra từ sáng kiến, tầm ảnh hưởng của đề tài và kiến nghị cụ thể gửi đến các cấp quản lý giáo dục.",
        aiSuggestedMetrics: [
          "Các bài học kinh nghiệm thiết thực rút ra cho bản thân và đồng nghiệp",
          "Đề xuất kiến nghị bổ sung trang thiết bị dạy học hiện đại"
        ],
        aiSuggestedEvidences: [
          "Bản tự nhận xét, đánh giá hiệu quả của giáo viên trong tổ chuyên môn",
          "Báo cáo thuyết trình sáng kiến kinh nghiệm trước Hội đồng nhà trường"
        ]
      },
      {
        id: "phu-luc-giao-an",
        title: "Phụ lục giáo án",
        vietnameseTitle: "Phụ lục: Kế hoạch bài dạy minh họa (Công văn 5512)",
        description: `Thiết kế một Kế hoạch bài dạy (Giáo án) mẫu cụ thể minh họa việc áp dụng sáng kiến/biện pháp "${title}" vào thực tế giảng dạy lớp ${finalGrade} môn ${finalSubject} tuân thủ đúng định dạng của Công văn 5512/BGDĐT.`,
        aiSuggestedMetrics: [
          "Thời lượng bài dạy thực nghiệm (tiết học)",
          "Tỷ lệ học sinh đạt mục tiêu bài học sau khi áp dụng hoạt động"
        ],
        aiSuggestedEvidences: [
          "Phiếu bài tập / Phiếu học tập cá nhân và nhóm sử dụng trong tiết học",
          "Bộ slide bài giảng điện tử minh họa hoạt động dạy học"
        ]
      }
    ];
  }

  return {
    analyzedTitle: `Nâng cao hiệu quả dạy học môn ${finalSubject} cho học sinh lớp ${finalGrade} thông qua ${processedTitle || "hoạt động dạy học tích cực"}`,
    scoreEstimation: Math.floor(Math.random() * 10) + 85,
    innovation: `Sáng kiến đề xuất một hệ thống giải pháp đổi mới toàn diện mang tính đột phá, chuyển dịch từ cách dạy truyền thống áp đặt một chiều sang hình thức tương tác đa chiều. Phương pháp này khuyến khích học sinh lớp ${finalGrade} chủ động trải nghiệm, thảo luận nhóm và tích cực tham gia xây dựng bài thông qua hoạt động thực tế.`,
    practicality: `Tính ứng dụng thực tiễn cực kỳ cao. Các biện pháp sư phạm đề xuất bám sát khung chương trình Giáo dục phổ thông mới (GDPT 2018), tận dụng triệt để cơ sở vật chất sẵn có, hoàn toàn phù hợp với điều kiện giảng dạy thực tế của các nhà trường tại Việt Nam hiện nay mà không đòi hỏi thêm chi phí phụ trợ tốn kém.`,
    suggestions: [
      `Bổ sung thêm các trò chơi học tập tương tác ngắn (3-5 phút) ở phần Khởi động nhằm tạo không khí sôi nổi và kích hoạt tư duy của học sinh lớp ${finalGrade} ngay đầu tiết học.`,
      `Thiết kế hệ thống phiếu học tập phân hóa theo 3 mức độ (Nhận biết - Thông hiểu - Vận dụng) nhằm hỗ trợ kịp thời đối tượng học sinh tiếp thu chậm đồng thời phát huy tối đa năng lực nhóm học sinh năng khiếu.`,
      `Tích hợp ứng dụng công nghệ thông tin (như các trò chơi trắc nghiệm Quizizz, Kahoot hoặc trình chiếu video thực tế ngắn) để nâng cao sự hứng thú và trực quan hóa các kiến thức khó.`
    ],
    standardOutlines: outlines
  };
}

function fallbackGenerateSection(title: string, subject: string, grade: string, category: string, sectionId: string, sectionTitle: string, description: string) {
  const finalSubject = subject || "Giáo dục";
  const finalGrade = grade || "tiểu học/trung học";

  if (sectionId === "mo-dau") {
    return `## 1. Lý do chọn đề tài
Trong bối cảnh nền giáo dục Việt Nam đang bước vào giai đoạn đổi mới mạnh mẽ theo Chương trình giáo dục phổ thông mới (GDPT 2018), mục tiêu tối cao của việc dạy học đã chuyển dịch từ truyền thụ kiến thức đơn thuần sang phát triển năng lực và phẩm chất toàn diện cho học sinh. Việc dạy học môn **${finalSubject}** tại cấp học lớp **${finalGrade}** đóng một vai trò vô cùng cốt lõi trong việc hình thành tư duy khoa học, nhân sinh quan và kỹ năng sống thực tiễn cho thế hệ trẻ.

Tuy nhiên, trong thực tế giảng dạy, phương pháp giảng dạy truyền thống mang tính áp đặt một chiều vẫn còn tồn tại phổ biến ở nhiều nơi. Học sinh lớp **${finalGrade}** thường có tâm lý thụ động, ghi nhớ kiến thức một cách máy móc mà thiếu đi sự hứng thú, say mê khám phá. Bản thân giáo viên cũng gặp không ít lúng túng trong việc thiết kế các hoạt động học tập tích cực để kích hoạt năng lực tự chủ của người học.

Xuất phát từ thực tế khách quan trên, cùng với mong muốn tìm ra giải pháp tối ưu nhằm khơi dậy ngọn lửa đam mê học tập của các em, tôi đã trăn trở nghiên cứu và mạnh dạn thực hiện đề tài sáng kiến: **"${title}"** áp dụng thực tế cho học sinh lớp **${finalGrade}** tại đơn vị trường học tôi đang công tác.

## 2. Mục đích nghiên cứu
Mục đích chính của đề tài sáng kiến kinh nghiệm này là nghiên cứu và tìm ra các biện pháp sư phạm, phương pháp tổ chức hoạt động học tập sáng tạo, khoa học nhằm:
- Kích hoạt tính chủ động, nâng cao lòng say mê học tập môn **${finalSubject}** của học sinh lớp **${finalGrade}**.
- Chuyển dịch phương thức dạy và học từ thụ động sang tương tác đa chiều, phát triển tối đa năng lực tự chủ, năng lực giao tiếp và hợp tác nhóm của học sinh.
- Cải thiện rõ rệt điểm số trung bình môn học và nâng cao năng lực ứng dụng kiến thức vào thực tế cuộc sống của học sinh.

## 3. Đối tượng và phạm vi nghiên cứu
- **Đối tượng nghiên cứu:** Các biện pháp sư phạm sáng tạo, thiết kế giáo án và phương pháp tổ chức lớp học tương tác trong môn **${finalSubject}**.
- **Phạm vi nghiên cứu:** Đề tài được áp dụng thực nghiệm trực tiếp tại các lớp học khối **${finalGrade}** của nhà trường trong suốt năm học hiện tại.

## 4. Phương pháp nghiên cứu
Để đề tài đạt được tính chính xác khoa học và có độ tin cậy thực chứng cao, tôi đã sử dụng kết hợp đồng bộ các nhóm phương pháp nghiên cứu sau:
- **Phương pháp nghiên cứu lý luận:** Thu thập, phân tích các tài liệu sư phạm, văn bản chỉ đạo của Bộ Giáo dục và Đào tạo liên quan đến chương trình GDPT 2018.
- **Phương pháp khảo sát thực tế:** Thực hiện phát phiếu khảo sát trắc nghiệm tâm lý, mức độ hứng thú trước giờ học và tổng hợp số liệu học tập đầu năm của học sinh.
- **Phương pháp thực nghiệm sư phạm:** Tổ chức các tiết dạy thử nghiệm có áp dụng các biện pháp đổi mới và tiến hành đối chứng với các lớp học theo phương pháp cũ.
- **Phương pháp thống kê toán học:** Sử dụng các công thức tính tỷ lệ %, giá trị trung bình để xử lý dữ liệu khảo sát định lượng một cách khách quan nhất.`;
  }

  if (sectionId === "co-so-ly-luan") {
    return `## 1. Cơ sở lý luận về dạy học phát triển năng lực
Cơ sở lý luận của đề tài **"${title}"** bám sát định hướng đổi mới căn bản và toàn diện nền giáo dục Việt Nam. Theo lý thuyết kiến tạo (Constructivism) của Jean Piaget và Lev Vygotsky, quá trình học tập thực chất không phải là sự tiếp nhận kiến thức một chiều thụ động mà là một quá trình học sinh tự xây dựng hệ thống kiến thức cho riêng mình dựa trên những trải nghiệm thực tế và sự tương tác xã hội. 

Việc giảng dạy môn **${finalSubject}** cho học sinh lớp **${finalGrade}** đòi hỏi người giáo viên phải đóng vai trò là người thiết kế, tổ chức và định hướng hoạt động học tập, thay vị thế trung tâm phát ngôn duy nhất trong lớp. Học sinh phải được đặt vào những tình huống học tập có vấn đề, từ đó thúc đẩy khả năng tự học, hợp tác và giải quyết vấn đề.

## 2. Các văn bản pháp lý làm căn cứ thực hiện đề tài
Đề tài sáng kiến được triển khai dựa trên các căn cứ pháp lý vững chắc sau:
- Nghị quyết số 29-NQ/TW của Ban Chấp hành Trung ương Đảng về đổi mới căn bản, toàn diện giáo dục và đào tạo.
- Thông tư hướng dẫn thực hiện chương trình giáo dục phổ thông môn **${finalSubject}** cấp học tương ứng ban hành kèm theo chương trình GDPT 2018 của Bộ trưởng Bộ Giáo dục và Đào tạo.
- Công văn số 5512/BGDĐT-GDTrH về việc xây dựng và tổ chức thực hiện kế hoạch giáo dục của nhà trường, hướng dẫn xây dựng giáo án phát triển năng lực học sinh một cách chuẩn hóa, khoa học.

## 3. Đặc điểm tâm sinh lý của đối tượng học sinh lớp ${finalGrade}
Học sinh lớp **${finalGrade}** đang ở trong độ tuổi chuyển giao tâm sinh lý vô cùng quan trọng. Giai đoạn này, các em có nhu cầu khẳng định bản thân rất cao, ham thích cái mới, thích thể hiện cá tính riêng biệt thông qua các hoạt động tương tác, làm việc nhóm nhưng tư duy chưa thực sự ổn định hoàn chỉnh. 

Học sinh thường dễ bị thu hút bởi các yếu tố trực quan sinh động như hình ảnh, trò chơi, cuộc thi đua tập thể hơn là những bài giảng thuyết trình thuần lý thuyết dài dòng. Do đó, việc đổi mới phương pháp theo hướng tương tác đa chiều là cực kỳ phù hợp để kích hoạt trí tuệ, tạo động lực học tập tự nhiên bên trong cho các em.`;
  }

  if (sectionId === "thuc-trang") {
    return `## 1. Thuận lợi và khó khăn khi triển khai thực hiện
Trong quá trình công tác giảng dạy môn **${finalSubject}** cho học sinh khối lớp **${finalGrade}** tại trường, tôi đã đúc rút được những thuận lợi và khó khăn thực tế như sau:

### Thuận lợi:
- Nhà trường nhận được sự quan tâm sát sao từ Ban giám hiệu, luôn tạo điều kiện tối đa hỗ trợ giáo viên đổi mới phương pháp giảng dạy. Cơ sở vật chất cơ bản của lớp học đã được trang bị màn hình chiếu, tivi thông minh và mạng Internet kết nối ổn định.
- Tổ chuyên môn của trường hoạt động đều đặn, giáo viên thường xuyên dự giờ trao đổi kinh nghiệm sư phạm định kỳ.
- Đa số học sinh lớp **${finalGrade}** ngoan ngoãn, có tinh thần cầu tiến và năng động trong các hoạt động phong trào chung.

### Khó khăn:
- Môn học **${finalSubject}** có lượng kiến thức tương đối rộng, nhiều nội dung còn nặng tính học thuật lý thuyết khô khan, khiến học sinh dễ cảm thấy buồn tẻ, mệt mỏi trong các tiết học kéo dài.
- Một bộ phận học sinh có hoàn cảnh gia đình khó khăn, chưa được cha mẹ quan tâm sát sao dẫn đến thái độ thờ ơ, lười chuẩn bị bài ở nhà trước giờ học.
- Quỹ thời gian dành cho các hoạt động thực hành, trải nghiệm trực quan ngoài không gian lớp học còn hạn chế, chủ yếu bó hẹp trong không gian phòng học tiêu chuẩn.

## 2. Kết quả khảo sát thực trạng đầu năm học
Để có cái nhìn khách quan khoa học nhất làm cơ sở triển khai các biện pháp trong sáng kiến **"${title}"**, tôi đã thực hiện một cuộc khảo sát thực nghiệm đầu năm học với lớp thực nghiệm (áp dụng biện pháp đổi mới) và lớp đối chứng (giảng dạy theo phương pháp truyền thống cũ).

### Bảng 1: Thống kê mức độ hứng thú học tập môn ${finalSubject} đầu năm của học sinh
| Nhóm khảo sát | Tổng số học sinh | Hứng thú tích cực (%) | Bình thường (%) | Thờ ơ, thụ động (%) |
| :--- | :---: | :---: | :---: | :---: |
| **Nhóm Thực nghiệm** | 40 | 15.0% (6 HS) | 50.0% (20 HS) | 35.0% (14 HS) |
| **Nhóm Đối chứng** | 40 | 17.5% (7 HS) | 47.5% (19 HS) | 35.0% (14 HS) |

### Bảng 2: Thống kê chất lượng học tập bộ môn đầu năm học
| Nhóm khảo sát | Điểm Giỏi (8.0 - 10) | Điểm Khá (6.5 - 7.9) | Điểm Trung bình (5.0 - 6.4) | Điểm Yếu (< 5.0) |
| :--- | :---: | :---: | :---: | :---: |
| **Nhóm Thực nghiệm** | 12.5% (5 HS) | 37.5% (15 HS) | 42.5% (17 HS) | 7.5% (3 HS) |
| **Nhóm Đối chứng** | 15.0% (6 HS) | 35.0% (14 HS) | 45.0% (18 HS) | 5.0% (2 HS) |

Qua bảng số liệu khảo sát thực tế trên, tôi nhận thấy tỷ lệ học sinh hứng thú học tập bộ môn còn rất thấp (chỉ khoảng 15% - 17.5%). Đa số học sinh chỉ học ở mức độ đối phó, thụ động lắng nghe và làm bài theo khuôn mẫu. Điểm số trung bình chủ yếu rơi vào phổ điểm trung bình khá, số lượng điểm giỏi xuất sắc rất hạn chế. Thực trạng này đòi hỏi phải có một giải pháp tác động sư phạm đồng bộ, quyết liệt để thay đổi tư duy và cải thiện chất lượng học tập cho các em.`;
  }

  if (sectionId === "giai-phap") {
    return `Dựa trên việc nghiên cứu kỹ lưỡng cơ sở lý luận và phân tích sâu sắc thực trạng vấn đề giảng dạy môn **${finalSubject}** lớp **${finalGrade}**, tôi xin đề xuất 3 giải pháp trọng tâm mang tính đột phá của sáng kiến **"${title}"** như sau:

## GIẢI PHÁP 1: Thiết kế chuỗi hoạt động học tập tương tác khởi động lớp học (Warm-up Games)
Khởi động là bước vô cùng quan trọng giúp phá vỡ bầu không khí im lặng đầu giờ, thu hút sự chú ý tuyệt đối của học sinh và định hướng tư duy vào nội dung bài học mới một cách tự nhiên nhất.

### Quy trình thực hiện cụ thể:
1. **Bước 1: Chuẩn bị trò chơi tương tác ngắn.** Giáo viên sử dụng các công cụ trực quan như bộ thẻ câu hỏi, vòng quay may mắn, hoặc thiết kế trò chơi trắc nghiệm ngắn trên phần mềm PowerPoint, Quizizz, Kahoot liên quan đến kiến thức cũ hoặc gợi mở kiến thức mới.
2. **Bước 2: Phân chia đội chơi.** Chia lớp thành các nhóm nhanh theo tổ hoặc bàn học. Áp dụng quy tắc tính điểm thi đua cộng thưởng để kích thích tinh thần tự hào tập thể của học sinh lớp **${finalGrade}**.
3. **Bước 3: Tổ chức chơi và dẫn dắt.** Giáo viên điều hành trò chơi trong thời gian từ 3 - 5 phút đầu giờ học. Đảm bảo luật chơi rõ ràng, tốc độ nhanh, tạo không khí hào hứng.
4. **Bước 4: Nhận xét và kết nối.** Giáo viên nhận xét nhanh, trao phần thưởng thi đua nhỏ (như điểm cộng hoặc nhãn dán sticker thưởng) và khéo léo kết nối bài học một cách tự nhiên.

---

## GIẢI PHÁP 2: Áp dụng kỹ thuật dạy học hợp tác nhóm sáng tạo (Group Work & Gallery Walk)
Làm việc nhóm giúp học sinh lớp **${finalGrade}** phát huy tối đa khả năng giao tiếp, tương tác, tranh luận và chia sẻ kiến thức đồng đẳng. Tôi áp dụng kỹ thuật "Phòng tranh" (Gallery Walk) kết hợp với "Bản đồ tư duy" (Mindmap) để tăng tính sáng tạo và trực quan cho sản phẩm của học sinh.

### Quy trình thực hiện:
1. **Bước 1: Giao nhiệm vụ rõ ràng.** Giáo viên chia lớp thành các nhóm từ 5 - 6 học sinh. Phân công rõ vai trò cho từng thành viên (Trưởng nhóm: điều phối; Thư ký: ghi chép; Người thuyết trình; Người quản lý thời gian). Giao nhiệm vụ thảo luận thiết kế sơ đồ tư duy giải quyết một tình huống môn **${finalSubject}** trên giấy A0.
2. **Bước 2: Hoạt động hợp tác nhóm.** Các nhóm có thời gian thảo luận từ 10 - 15 phút. Học sinh được tự do trao đổi, vẽ, tô màu, dán hình ảnh minh họa để hoàn thành sản phẩm sáng tạo của nhóm mình. Giáo viên di chuyển xung quanh hỗ trợ, định hướng các nhóm gặp khó khăn.
3. **Bước 3: Tổ chức triển lãm phòng tranh.** Các nhóm dán sản phẩm của mình lên xung quanh tường lớp học. Đại diện 1 học sinh ở lại bàn nhóm làm "hướng dẫn viên du lịch" thuyết trình cho các nhóm khác đến tham quan. Các thành viên còn lại di chuyển vòng tròn xung quanh lớp để quan sát, ghi chép nhận xét và đặt câu hỏi phản biện cho nhóm bạn.
4. **Bước 4: Đánh giá đồng đẳng.** Học sinh dán các giấy nhớ (sticky notes) góp ý trực tiếp vào sản phẩm của nhóm bạn. Giáo viên tổng hợp nhận xét, chuẩn hóa kiến thức cốt lõi và chấm điểm thi đua công khai cho toàn bộ sản phẩm.

---

## GIẢI PHÁP 3: Tích hợp bài tập tình huống thực tế và phiếu tự đánh giá năng lực cá nhân
Việc mang cuộc sống thực tiễn vào bài giảng môn **${finalSubject}** giúp học sinh lớp **${finalGrade}** trả lời được câu hỏi "Học kiến thức này để làm gì?". Tôi biên soạn hệ thống bài tập tình huống gắn với các vấn đề gia đình, trường học, xã hội gần gũi nhất với lứa tuổi của các em.

### Quy trình thực hiện:
- Giáo viên đưa ra tình huống thực tế phát sinh trong cuộc sống thông qua video ngắn hoặc câu chuyện kể súc tích.
- Học sinh tự suy nghĩ và viết phương án giải quyết tình huống cá nhân vào phiếu bài tập học tập.
- Cuối bài học, học sinh được phát phiếu "Tự đánh giá năng lực cá nhân" để tự nhận xét tiến trình tiếp thu bài của mình, giúp giáo viên nắm bắt được mức độ hiểu bài thực tế của từng em nhằm có phương án điều chỉnh sư phạm phù hợp cho các tiết học tiếp theo.`;
  }

  if (sectionId === "ket-qua") {
    return `## 1. Kết quả định tính về thái độ và nhận thức của học sinh
Sau một năm học kiên trì áp dụng đồng bộ các giải pháp đột phá thuộc đề tài sáng kiến **"${title}"** cho học sinh lớp **${finalGrade}** đối với môn **${finalSubject}**, tôi đã ghi nhận được những chuyển biến vô cùng tích cực, rõ nét và bền vững:
- **Tinh thần tự học được khơi dậy mạnh mẽ:** Không còn tình trạng học sinh ngồi thụ động chép bài mệt mỏi hay nói chuyện riêng trong lớp. Các em luôn mong chờ đến tiết học môn **${finalSubject}** để được tham gia các hoạt động trò chơi, thảo luận nhóm hấp dẫn.
- **Kỹ năng mềm tiến bộ vượt bậc:** Học sinh có sự phát triển rõ rệt về kỹ năng giao tiếp, khả năng diễn đạt lưu loát trước đám đông, tự tin bảo vệ quan điểm cá nhân và hợp tác nhóm vô cùng ăn ý nhịp nhàng.
- **Mối quan hệ thầy trò gắn kết sâu sắc:** Giáo viên trở thành người bạn đồng hành ân cần hỗ trợ học sinh học tập, tạo dựng không khí lớp học hạnh phúc, tràn đầy sự tôn trọng và tình yêu thương.

## 2. Số liệu thống kê đối chứng định lượng thực tế
Để minh chứng cho tính hiệu quả thực tiễn của sáng kiến một cách khoa học thuyết phục, tôi đã tiến hành khảo sát và đo lường kết quả của lớp thực nghiệm (40 học sinh áp dụng sáng kiến) và lớp đối chứng (40 học sinh dạy theo phương pháp truyền thống cũ) vào cuối năm học.

### Bảng 1: So sánh mức độ hứng thú học tập của học sinh ở giai đoạn cuối năm học
| Nhóm đối chứng/thực nghiệm | Tổng số học sinh | Hứng thú tích cực (%) | Bình thường (%) | Thờ ơ, thụ động (%) |
| :--- | :---: | :---: | :---: | :---: |
| **Nhóm Thực nghiệm (Áp dụng SKKN)** | 40 | **72.5%** (29 HS) | 22.5% (9 HS) | **5.0%** (2 HS) |
| **Nhóm Đối chứng (Không áp dụng)** | 40 | 20.0% (8 HS) | 52.5% (21 HS) | 27.5% (11 HS) |

### Bảng 2: So sánh chất lượng học tập bộ môn học kỳ cuối năm học
| Nhóm đối chứng/thực nghiệm | Điểm Giỏi (8.0 - 10) | Điểm Khá (6.5 - 7.9) | Điểm Trung bình (5.0 - 6.4) | Điểm Yếu (< 5.0) |
| :--- | :---: | :---: | :---: | :---: |
| **Nhóm Thực nghiệm (Áp dụng SKKN)** | **42.5%** (17 HS) | **45.0%** (18 HS) | 12.5% (5 HS) | **0.0%** (0 HS) |
| **Nhóm Đối chứng (Không áp dụng)** | 17.5% (7 HS) | 37.5% (15 HS) | 40.0% (16 HS) | 5.0% (2 HS) |

Nhìn vào các bảng số liệu so sánh đối chứng khoa học trên, chúng ta có thể thấy một sự chuyển dịch chất lượng vô cùng tuyệt vời:
- Tỷ lệ học sinh hứng thú học tập tích cực ở lớp thực nghiệm đã nhảy vọt từ **15.0% đầu năm lên đến 72.5% cuối năm**, trong khi lớp đối chứng hầu như không có sự thay đổi đáng kể. Tỷ lệ học sinh thụ động, thờ ơ giảm xuống mức tối thiểu (chỉ còn 5%).
- Về chất lượng điểm số học tập: Lớp thực nghiệm ghi nhận tỷ lệ học sinh đạt điểm giỏi xuất sắc tăng gấp đôi (đạt **42.5%** so với 17.5% của lớp đối chứng) và đặc biệt **không có học sinh bị điểm yếu dưới trung bình**. Điều này khẳng định tính khả thi, hiệu quả vượt trội và tầm ảnh hưởng thực tế to lớn của sáng kiến sư phạm đã triển khai.`;
  }

  if (sectionId === "ket-luan") {
    return `## 1. Ý nghĩa và bài học kinh nghiệm sâu sắc rút ra
Đề tài sáng kiến kinh nghiệm **"${title}"** áp dụng cho môn **${finalSubject}** lớp **${finalGrade}** đã hoàn thành trọn vẹn các mục tiêu nghiên cứu đề ra, mang lại luồng sinh khí mới tích cực cho không gian lớp học. Qua một năm học thực nghiệm và đúc kết kinh nghiệm thực tế, tôi xin rút ra một số bài học kinh nghiệm sư phạm cốt lõi như sau:
- **Người giáo viên phải luôn đi đầu trong đổi mới:** Giáo viên cần chủ động thay đổi tư duy lối mòn, không ngừng tự học hỏi, tích cực cập nhật và áp dụng các phương pháp giảng dạy tương tác hiện đại bám sát định hướng phát triển năng lực của học sinh.
- **Tôn trọng sự khác biệt của học sinh:** Mọi học sinh đều có thế mạnh riêng biệt. Giáo viên cần thiết kế các hoạt động học tập đa dạng, phân hóa sâu sắc để tạo cơ hội cho mọi học sinh được tỏa sáng và thể hiện năng lực bản thân.
- **Sự chuẩn bị chu đáo quyết định thành công:** Để một tiết học tương tác diễn ra suôn sẻ, giáo viên phải dành nhiều thời gian chuẩn bị kế hoạch bài dạy chi tiết, thiết kế đồ dùng dạy học trực quan sáng tạo và lường trước các tình huống sư phạm có thể phát sinh trong lớp học.

## 2. Các đề xuất và kiến nghị cụ thể
Để sáng kiến kinh nghiệm được nhân rộng hiệu quả hơn nữa, tôi xin đề xuất kiến nghị lên các cấp quản lý giáo dục:

### Đối với Ban Giám hiệu nhà trường:
- Tiếp tục tổ chức thêm các buổi chuyên đề, hội thảo chuyên môn thảo luận sâu về đổi mới phương pháp giảng dạy phát triển năng lực học sinh để giáo viên giao lưu học hỏi lẫn nhau.
- Ưu tiên đầu tư nâng cấp thêm trang thiết bị dạy học hiện đại cho các phòng học (như máy chiếu công suất lớn, âm thanh tốt, bàn ghế học tập thông minh dễ dàng di chuyển để xếp mô hình học tập theo nhóm).

### Đối với Phòng Giáo dục và Đào tạo cấp Quận/Huyện:
- Khuyến khích tuyên dương kịp thời và tạo diễn đàn chia sẻ rộng rãi các sáng kiến kinh nghiệm đạt giải cao cấp Quận/Huyện lên cổng thông tin điện tử ngành giáo dục để giáo viên các trường khác cùng tham khảo áp dụng thực tế, thúc đẩy sự phát triển chuyên môn đồng đều cho toàn địa phương.`;
  }

  if (sectionId === "phu-luc-giao-an") {
    return `## KẾ HOẠCH BÀI DẠY MINH HỌA (CÔNG VĂN 5512)
**Tên bài học:** Tiết học thực nghiệm áp dụng chuyên đề: "${title}"
**Môn học:** ${finalSubject} | **Lớp:** ${finalGrade}
**Thời lượng:** 01 tiết (35 - 45 phút)

### I. MỤC TIÊU BÀI HỌC
1. **Về năng lực:**
- *Năng lực chuyên môn:* Học sinh nhận biết và vận dụng được các từ khóa, khái niệm và nguyên lý cốt lõi của bài học thông qua hoạt động tương tác trải nghiệm của biện pháp "${title}".
- *Năng lực chung:* Phát triển năng lực tự chủ và tự học khi thực hiện nhiệm vụ cá nhân; năng lực giao tiếp và hợp tác trong quá trình thảo luận nhóm và trình bày sản phẩm học tập.
2. **Về phẩm chất:**
- Giáo dục phẩm chất chăm chỉ, trách nhiệm khi tham gia xây dựng bài học cùng tập thể lớp.

### II. THIẾT BỊ DẠY HỌC VÀ HỌC LIỆU
- **Giáo viên:** Máy chiếu thông minh, bộ thẻ trò chơi học tập tương tác, phiếu học tập nhóm lớn.
- **Học sinh:** Sách giáo khoa, bút viết, bảng nhóm.

### III. TIẾN TRÌNH DẠY HỌC
#### Hoạt động 1: Khởi động (Warm-up) - 5 phút
- *Mục tiêu:* Kích hoạt tâm thế học tập hứng khởi và kết nối kiến thức cũ của học sinh.
- *Nội dung:* Học sinh tham gia trò chơi tương tác ngắn đoán ô chữ hoặc giải câu đố nhanh do giáo viên tổ chức.
- *Sản phẩm học tập:* Không khí lớp học sôi nổi, học sinh hào hứng và trả lời đúng các từ khóa dẫn dắt.
- *Tổ chức thực hiện:* Giáo viên phổ biến luật chơi -> Học sinh tham gia trả lời nhanh -> Giáo viên đánh giá và dẫn dắt vào bài mới.

#### Hoạt động 2: Hình thành kiến thức mới (20 phút)
- *Mục tiêu:* Học sinh tự khám phá kiến thức nền tảng của bài học thông qua thảo luận nhóm.
- *Nội dung:* Làm việc theo nhóm 4-6 học sinh đọc tài liệu học tập và hoàn thành Phiếu học tập số 1.
- *Sản phẩm:* Kết quả thảo luận nhóm được viết chi tiết trên giấy Ao hoặc bảng nhóm.
- *Tổ chức thực hiện:* Giao nhiệm vụ học tập cho các nhóm -> Học sinh thảo luận tự chủ -> Đại diện nhóm trình bày sản phẩm -> Giáo viên chốt kiến thức cốt lõi.

#### Hoạt động 3: Luyện tập và Vận dụng (15 phút)
- *Mục tiêu:* Khắc sâu kiến thức bài học và kết nối trực tiếp với thực tiễn cuộc sống.
- *Nội dung:* Học sinh giải quyết tình huống thực tế bằng Phiếu học tập số 2 hoặc hoàn thành sản phẩm học tập tự chọn theo năng lực cá nhân.
- *Tổ chức thực hiện:* Giao tình huống thực tế -> Học sinh làm việc cá nhân hoặc cặp đôi -> Báo cáo kết quả nhanh -> Giáo viên nhận xét, đánh giá sản phẩm, khen thưởng và tuyên dương tinh thần học tập tích cực.`;
  }

  return `## Nội dung nghiên cứu chi tiết về ${sectionTitle}
Trong phần nghiên cứu chuyên sâu về **${sectionTitle}** thuộc khuôn khổ đề tài sáng kiến **"${title}"**, mục tiêu trọng tâm là làm sáng tỏ vai trò, quy trình và các minh chứng thực tế nhằm nâng cao chất lượng dạy học môn **${finalSubject}** cho học sinh lớp **${finalGrade}**.

### 1. Ý nghĩa và định hướng triển khai cụ thể
Việc nghiên cứu và áp dụng nội dung **${sectionTitle}** bám sát định hướng của chương trình giáo dục phổ thông mới (GDPT 2018), tập trung vào sự hình thành phẩm chất và năng lực cho học sinh. Các bước cụ thể bao gồm:
- **Phân tích bối cảnh giáo dục:** Xác định rõ sự tác động của giải pháp đối với tư duy nhận thức của học sinh lớp **${finalGrade}**.
- **Xây dựng quy trình thực hiện:** Định hình các hoạt động tương tác sư phạm chặt chẽ, lôi cuốn sự tham gia nhiệt tình của học sinh.
- **Đánh giá hiệu quả:** Sử dụng các phương pháp đo lường khoa học, minh chứng bằng sự tiến bộ rõ rệt trong kỹ năng và thái độ của các em.

### 2. Ví dụ minh họa thực tiễn áp dụng vào bài học
Để nội dung này thực sự thuyết phục ban giám khảo và áp dụng tốt vào lớp học, giáo viên cần tích hợp các bài tập trải nghiệm thực hành hoặc đưa ra các bài học tình huống thực tế giúp các em liên hệ kiến thức lý thuyết học đường trực tiếp với cuộc sống thường nhật xung quanh. Việc này giúp học sinh học một cách chủ động, sáng tạo và nhớ sâu kiến thức môn **${finalSubject}** một cách tự nhiên.`;
}

function fallbackEvaluateInitiative(title: string, subject: string, grade: string, category: string, outline: any) {
  const finalSubject = subject || "Giáo dục";
  const finalGrade = grade || "tiểu học/trung học";

  return {
    score: 91,
    criteria: {
      innovation: {
        score: 88,
        feedback: "Đề tài thể hiện tư duy đổi mới sư phạm rất đáng khích lệ. Việc áp dụng các giải pháp tương tác đa chiều đã thoát ly hoàn toàn khỏi lối mòn dạy học thuyết giảng thụ động cũ, mang tính đột phá cao."
      },
      practicality: {
        score: 93,
        feedback: "Sáng kiến bám sát thực trạng giảng dạy môn học tại Việt Nam hiện nay, đặc biệt là việc tích hợp các trò chơi khởi động lớp và học tập hợp tác nhóm cực kỳ dễ tổ chức thực tế."
      },
      methodology: {
        score: 90,
        feedback: "Cấu trúc nghiên cứu mạch lạc khoa học, đầy đủ từ cơ sở lý luận, phân tích thực trạng thực tế đến đối chứng số liệu hiệu quả và rút ra bài học kinh nghiệm sâu sắc."
      },
      replicability: {
        score: 91,
        feedback: "Các giải pháp được mô tả rõ ràng chi tiết theo từng bước cụ thể, có khả năng chuyển giao và nhân rộng rất tốt cho các trường học khác trong quận/huyện tham khảo."
      },
      presentation: {
        score: 92,
        feedback: "Bố cục trình bày rất chuẩn mực, khoa học. Hệ thống bảng biểu đối so sánh trước - sau thực nghiệm trực quan sinh động mang lại tính thuyết phục thực chứng cao."
      }
    },
    panelComments: [
      {
        id: "judge-1",
        name: "ThS. Nguyễn Minh Tuấn",
        role: "Chủ tịch Hội đồng - Trưởng phòng GD&ĐT Quận/Huyện",
        avatar: "NMT",
        avatarColor: "from-orange-500 to-amber-500",
        tone: "Nghiêm túc, chú trọng thực tế và tính lan tỏa",
        comment: `Đề tài "${title}" có tính thực tiễn cực kỳ xuất sắc. Các giải pháp sư phạm đề cập bám sát chương trình phổ thông mới (GDPT 2018), giải quyết trực diện được thực trạng thụ động học tập của học sinh lớp ${finalGrade} hiện nay. Tôi rất đánh giá cao tính khả thi của các trò chơi học tập tương tác và khuyến nghị áp dụng nhân rộng sáng kiến này rộng rãi cấp Quận/Huyện.`,
        rating: 9
      },
      {
        id: "judge-2",
        name: "Cô Lê Thị Thanh Thủy",
        role: "Ủy viên phản biện - Hiệu trưởng Trường THCS chuyên môn giỏi",
        avatar: "LTT",
        avatarColor: "from-purple-500 to-indigo-500",
        comment: `Là một giáo viên đứng lớp nhiều năm, tôi rất đồng cảm với thực trạng khó khăn mà tác giả đã nêu ra trong môn học ${finalSubject}. Các biện pháp tương tác nhóm (Gallery Walk) được thiết kế chi tiết sáng tạo giúp phát huy tối đa năng lực giao tiếp và tự học của các em. Bản thảo viết rất mạch lạc, hình thức đẹp.`,
        rating: 9
      },
      {
        id: "judge-3",
        name: "ThS. Đỗ Quốc Anh",
        role: "Ủy viên hội đồng - Thanh tra Sở GD&ĐT",
        avatar: "DQA",
        avatarColor: "from-emerald-500 to-teal-500",
        comment: `Cơ sở lý luận vững vàng và bám sát Công văn 5512 của Bộ Giáo dục và Đào tạo. Hệ thống bảng biểu số liệu khảo sát đối chứng trước và sau thực nghiệm có tính khoa học cao, khách quan và đáng tin cậy. Đề tài hoàn toàn đủ điều kiện xếp loại xuất sắc cấp Tỉnh.`,
        rating: 9
      }
    ],
    suggestedQuestions: [
      {
        question: `Làm thế nào để Thầy/Cô quản lý tốt thời gian lớp học khi tổ chức hoạt động học hợp tác nhóm lớn (Gallery Walk) cho học sinh lớp ${finalGrade} không bị lố giờ?`,
        suggestedAnswer: "Tôi luôn phân công vai trò nhiệm vụ rõ ràng cho từng thành viên nhóm (nhóm trưởng, thư ký, quản trò) và thiết lập đồng hồ đếm ngược hiển thị công khai trên màn hình lớp. Đồng thời, giáo viên di chuyển liên tục để đôn đốc và hỗ trợ định hướng các nhóm hoạt động bám sát tiến độ."
      },
      {
        question: "Phương án kiểm tra, đánh giá học sinh trong các hoạt động tương tác nhóm được giáo viên triển khai cụ thể thế nào để đảm bảo công bằng khách quan?",
        suggestedAnswer: "Tôi sử dụng bảng tiêu chí chấm điểm (Rubrics) được thống nhất công khai trước giờ học. Kết hợp đồng bộ giữa việc học sinh tự đánh giá cá nhân, các nhóm đánh giá chéo lẫn nhau (đánh giá đồng đẳng) và giáo viên quan sát chấm điểm cuối cùng dựa trên sản phẩm chính thức."
      },
      {
        question: `Đối với những học sinh lớp còn nhút nhát, lười tham gia hoạt động, Thầy/Cô có biện pháp tác động tâm lý gì để lôi cuốn các em cùng tham gia hoạt động tương tác?`,
        suggestedAnswer: "Tôi luôn ưu tiên giao cho những học sinh nhút nhát những nhiệm vụ vừa sức ban đầu (như quản lý thời gian, trang trí sản phẩm vẽ, hoặc giữ thẻ câu hỏi) rồi khuyến khích bằng những lời khen, sticker thưởng để xây dựng sự tự tin. Đồng thời, phân công nhóm trưởng có năng lực thân thiện đồng hành hỗ trợ, dắt tay em cùng hòa nhập hoạt động tập thể."
      }
    ],
    generalFeedback: `Đề tài Sáng kiến kinh nghiệm "${title}" môn ${finalSubject} lớp ${finalGrade} được thiết kế vô cùng chỉn chu, có tính thời sự cao trong bối cảnh đổi mới chương trình GDPT 2018. Để sáng kiến hoàn thiện hơn nữa và tăng cơ hội đạt điểm tuyệt đối trước hội đồng thi, tác giả có thể bổ sung thêm 1 kế hoạch bài dạy (Giáo án mẫu) minh họa thực tế trực quan đính kèm ở phần phụ lục.`
  };
}

function fallbackChatAssistant(title: string, subject: string, grade: string, category: string, sectionTitle: string, content: string, chatHistory: any[], userMessage: string) {
  const finalSubject = subject || "Giáo dục";
  const finalGrade = grade || "tiểu học/trung học";
  const lowerMsg = userMessage.toLowerCase();
  let reply = "";

  if (lowerMsg.includes("xin chào") || lowerMsg.includes("chào") || lowerMsg.includes("hello")) {
    reply = `Xin chào Thầy/Cô! Tôi là **Trợ lý AI SKKN 2026 PRO** 🌟. 

Tôi sẵn sàng đồng hành cùng Thầy/Cô hoàn thành xuất sắc đề tài: 
**"${title}"** môn **${finalSubject}** lớp **${finalGrade}**.

Hiện tại Thầy/Cô đang ở phần biên soạn: **"${sectionTitle || 'Toàn bộ tài liệu'}"**.
Tôi có thể giúp Thầy/Cô:
1. Viết tiếp một đoạn văn phong sư phạm chuẩn mực.
2. Gợi ý bảng biểu số liệu khảo sát thực tế giả định.
3. Tìm kiếm và đề xuất các giải pháp trò chơi, hoạt động tương tác hấp dẫn.

Thầy/Cô muốn tôi hỗ trợ nội dung cụ thể nào ạ?`;
  } else if (lowerMsg.includes("viết tiếp") || lowerMsg.includes("soạn") || lowerMsg.includes("viết giúp") || lowerMsg.includes("thêm")) {
    reply = `Dưới đây là một đoạn biên soạn mẫu bằng văn phong sư phạm chuẩn mực, sâu sắc, định hướng phát triển năng lực học sinh mà Thầy/Cô có thể đưa vào phần **${sectionTitle || 'nội dung'}**:

***

"Trong thực tế triển khai các phương pháp dạy học tương tác đối với môn **${finalSubject}** cho học sinh lớp **${finalGrade}**, vai trò chủ đạo của giáo viên không hề bị mờ nhạt đi mà ngược lại, đòi hỏi sự tinh tế và kỹ năng sư phạm cao hơn very much. Việc chuyển dịch từ vị thế truyền đạt kiến thức thuần túy sang vai trò người đồng hành, điều phối đòi hỏi giáo viên phải biết khơi dậy tiềm năng tự học, kích thích tư duy phản biện của học sinh bằng các hệ thống câu hỏi mở, các tình huống thực tiễn sinh động.

Khi các em tham gia thảo luận hay thực hành trải nghiệm, giáo viên cần di chuyển liên tục, chú ý quan sát từng cá nhân, đặc biệt là nhóm học sinh nhút nhát, chậm tiếp thu để kịp thời nâng đỡ, định hướng và động viên các em. Những lời khen ngợi chân thành, sự ghi nhận nỗ lực dù là nhỏ nhất thông qua sticker thưởng hay điểm thi đua chính là liều thuốc tinh thần diệu kỳ kích hoạt sự tự tin và khát khao khẳng định mình của học sinh lớp **${finalGrade}**."

***

Thầy/Cô có cần tôi thay đổi văn phong hoặc bổ sung chi tiết gì thêm vào đoạn viết trên không ạ?`;
  } else if (lowerMsg.includes("bảng biểu") || lowerMsg.includes("số liệu") || lowerMsg.includes("khảo sát")) {
    reply = `Dưới đây là gợi ý thiết kế bảng biểu số liệu khảo sát thực tế định lượng trực quan, có tính thuyết phục cao để Thầy/Cô đưa vào đề tài:

### Bảng khảo sát mức độ tự chủ và hứng thú học tập môn ${finalSubject} của học sinh lớp ${finalGrade} (Thực tế thực nghiệm):

| Nhóm đối chứng/thực nghiệm | Tổng số học sinh | Mức độ hứng thú cao (%) | Mức độ bình thường (%) | Thái độ thụ động (%) |
| :--- | :---: | :---: | :---: | :---: |
| **Lớp Thực nghiệm (Áp dụng biện pháp mới)** | 40 | **75.0%** (30 học sinh) | 20.0% (8 học sinh) | **5.0%** (2 học sinh) |
| **Lớp Đối chứng (Phương pháp truyền thống)** | 40 | 22.5% (9 học sinh) | 50.0% (20 học sinh) | 27.5% (11 học sinh) |

*Nhận xét số liệu:* Bảng thống kê đối chứng trên chỉ ra sự chuyển biến vượt bậc về mặt thái độ học tập của các em học sinh lớp thực nghiệm. Việc áp dụng các giải pháp đổi mới tương tác giúp tỷ lệ hứng thú tích cực tăng vọt và đẩy tỷ lệ thụ động thờ ơ xuống mức thấp nhất (chỉ còn 5%).

Thầy/Cô có thể điều chỉnh số lượng học sinh thực tế của lớp mình trực tiếp trên bảng này nhé!`;
  } else if (lowerMsg.includes("giải pháp") || lowerMsg.includes("biện pháp") || lowerMsg.includes("làm thế nào") || lowerMsg.includes("gợi ý")) {
    reply = `Dưới đây là một số gợi ý giải pháp sư phạm thực tiễn, có tính sáng tạo cao phù hợp với đề tài:

1. **Giải pháp 1: Thiết kế "Cây hoa học tốt" trong lớp học.** Mỗi giờ học, học sinh phát biểu đúng hoặc hoàn thành xuất sắc hoạt động nhóm sẽ được dán một "bông hoa điểm tốt" mang tên mình lên cây thi đua của lớp. Cuối tháng/cuối học kỳ sẽ tiến hành vinh danh "Hiệp sĩ chuyên cần".
2. **Giải pháp 2: Xây dựng chuyên mục "Học sinh làm chủ lớp học" (Student-Led Class).** Giáo viên dành khoảng 5 - 7 phút trong tiết học cho một nhóm học sinh tự nghiên cứu, tự thiết kế bài thuyết trình ngắn và đứng trước lớp chia sẻ kiến thức nhỏ với các bạn bằng ngôn ngữ của riêng các em.
3. **Giải pháp 3: Thiết kế "Hộp thư điều ước Sư phạm" (Pedagogical Wishbox).** Đặt một hộp thư nhỏ ở cuối lớp để học sinh tự do gửi thư viết tay chia sẻ những khó khăn, khúc mắc học tập hoặc những điều ước về một giờ học mơ ước. Điều này giúp giáo viên thấu cảm học sinh sâu sắc hơn.

Thầy/Cô thấy giải pháp nào phù hợp nhất với lớp học của mình ạ? Tôi có thể viết chi tiết quy trình tổ chức cho giải pháp đó giúp Thầy/Cô!`;
  } else {
    reply = `Cảm ơn câu hỏi rất thực tế của Thầy/Cô! Với nội dung Thầy/Cô vừa hỏi về đề tài **"${title}"**, dưới đây là tư vấn chuyên sâu dưới góc độ Hội đồng chấm thi Sáng kiến kinh nghiệm:

- **Bản chất vấn đề:** Thầy/Cô nên tập trung giải quyết triệt để thực trạng thụ động của học sinh lớp **${finalGrade}** bằng cách áp dụng phương pháp đổi mới tương tác đa chiều.
- **Cách trình bày:** Luôn bám sát quy trình 3 bước (Chuẩn bị -> Thực hiện -> Đánh giá rút kinh nghiệm) để bài viết có tính logic khoa học cao.
- **Minh chứng đi kèm:** Hãy đính kèm thêm hình ảnh học sinh say mê tương tác, thảo luận nhóm hoặc chụp lại phiếu học tập, sản phẩm sơ đồ tư duy thực tế của các em để thuyết phục hoàn toàn giám khảo.

Nếu Thầy/Cô cần tôi soạn thảo chi tiết hơn về một khía cạnh cụ thể, hãy viết yêu cầu của mình tại đây nhé! Tôi luôn sẵn sàng hỗ trợ 24/7.`;
  }

  return { reply };
}

// API endpoint for health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// 1. Topic Analysis Route
app.post("/api/analyze-topic", async (req, res) => {
  const { title, descriptionIdea, subject, grade, category, customOutline } = req.body;

  if (!title && !descriptionIdea) {
    return res.status(400).json({ error: "Tiêu đề đề tài hoặc Mô tả ý tưởng không được để trống" });
  }

  const actualTitle = title ? title.trim() : "";
  const actualDescription = descriptionIdea ? descriptionIdea.trim() : "";

  let outlineInstructions = "";
  if (customOutline && Array.isArray(customOutline) && customOutline.length > 0) {
    const formattedCustom = customOutline.map((item, idx) => `+ Phần ${idx + 1}: "${item}"`).join("\n");
    outlineInstructions = `
RẤT QUAN TRỌNG: Thầy/Cô đã chủ động cung cấp một cấu trúc khung gồm các phần cụ thể sau đây cho đề tài này. Bạn BẮT BUỘC phải giữ nguyên 100% tên các phần này trong danh sách "standardOutlines" trả về, sắp xếp đúng thứ tự từ trên xuống dưới:
${formattedCustom}

Với mỗi phần người dùng đã cung cấp ở trên:
- Hãy tự đặt "id" ngắn gọn, duy nhất không dấu (ví dụ: "phan-1-mo-dau", "giai-phap-thuc-te", "khao-sat-thuc-te").
- Thiết lập "title" là phiên bản ngắn gọn của phần đó (ví dụ: "Mở đầu" hoặc "Thực trạng").
- Thiết lập "vietnameseTitle" phải TRÙNG KHỚP HOÀN TOÀN 100% với tên phần người dùng đã cung cấp.
- Viết "description" chi tiết và chuẩn mực, hướng dẫn yêu cầu cụ thể những gì Thầy/Cô nên viết cho phần đó tương ứng với đề tài "${actualTitle || 'Sáng kiến kinh nghiệm'}".
- Đề xuất "aiSuggestedMetrics" (mảng danh sách các số liệu khảo sát/phân tích đo lường cụ thể cho phần đó).
- Đề xuất "aiSuggestedEvidences" (mảng danh sách các hình ảnh, giáo án mẫu, phiếu học tập... minh chứng đi kèm).

Tuyệt đối không tự ý thêm, sửa, hay lược bớt bất kỳ phần nào ngoài danh sách Thầy/Cô đã cung cấp phía trên!
`;
  } else {
    outlineInstructions = `
Hãy tự động thiết kế một cấu trúc khung (standardOutlines) chuẩn mực gồm đúng 7 phần (từ Phần I đến Phần VI, và một phần Phụ lục kế hoạch bài dạy) tối ưu nhất cho loại đề tài này để giúp Thầy/Cô hoàn thành xuất sắc nhất. Mỗi phần cần có các trường:
- "id": định danh dạng không dấu như "mo-dau", "thuc-trang"
- "title": tên ngắn gọn của phần
- "vietnameseTitle": tên đầy đủ trang trọng bằng tiếng Việt (ví dụ: "Phần I: Mở đầu", "Phần II: Cơ sở lý luận"..., và phần cuối cùng là "Phụ lục: Kế hoạch bài dạy minh họa (Công văn 5512)")
- "description": hướng dẫn chi tiết yêu cầu soạn thảo chuẩn của phần đó
- "aiSuggestedMetrics": mảng các chỉ số đo lường khảo sát gợi ý
- "aiSuggestedEvidences": mảng các loại minh chứng gợi ý đi kèm
`;
  }

  const prompt = `
Hãy phân tích tên đề tài Sáng kiến kinh nghiệm (SKKN) hoặc Biện pháp sư phạm sau đây theo chương trình giáo dục phổ thông Việt Nam mới (GDPT 2018):
${actualTitle ? `- Tên đề tài gốc: "${actualTitle}"` : ''}
${actualDescription ? `- Ý tưởng/Mô tả nội dung sáng kiến chi tiết: "${actualDescription}"` : ''}
- Môn học: "${subject || 'Chung'}"
- Khối lớp: "${grade || 'Toàn trường'}"
- Phân loại: "${category === 'bien-phap' ? 'Biện pháp sư phạm thi Giáo viên giỏi' : category === 'ho-so' ? 'Hồ sơ Giáo viên chủ nhiệm giỏi' : 'Sáng kiến kinh nghiệm (SKKN)'}"

${!actualTitle && actualDescription ? 'LƯU Ý QUAN TRỌNG: Tác giả chưa đặt tên đề tài sáng kiến. Hãy phân tích kỹ ý tưởng mô tả ở trên của tác giả để tự động biên soạn và đề xuất 1 Tên đề tài (analyzedTitle) thật chuẩn mực, ngắn gọn, khoa học và thu hút nhất!' : ''}

Yêu cầu phân tích và trả về cấu trúc JSON đúng định dạng sau:
{
  "analyzedTitle": "Gợi ý 1-2 phiên bản tên đề tài đã được chuẩn hóa khoa học hơn, sát thực tế hơn",
  "scoreEstimation": 85, // Ước lượng điểm chất lượng ban đầu của đề tài từ 1 đến 100
  "innovation": "Phân tích chi tiết tính mới, tính sáng tạo của đề tài (Khoảng 3-4 câu)",
  "practicality": "Phân tích tính khả thi và tính thực tiễn khi áp dụng vào thực tế giảng dạy tại các trường học ở Việt Nam (Khoảng 3-4 câu)",
  "suggestions": [
    "Gợi ý cụ thể cải tiến số 1 để nâng cao tính thuyết phục và tăng cơ hội đạt giải cao",
    "Gợi ý cải tiến số 2...",
    "Gợi ý cải tiến số 3..."
  ],
  "standardOutlines": [
    {
      "id": "mo-dau",
      "title": "Mở đầu",
      "vietnameseTitle": "Phần I: Mở đầu",
      "description": "Lý do chọn đề tài, Mục đích nghiên cứu, Đối tượng, Phạm vi và Phương pháp nghiên cứu.",
      "aiSuggestedMetrics": ["Phiếu khảo sát hứng thú học tập đầu năm của học sinh", "Tỷ lệ tham gia phát biểu xây dựng bài"],
      "aiSuggestedEvidences": ["Kết quả khảo sát đầu năm (bảng số liệu)", "Hình ảnh hoạt động học tập ban đầu"]
    },
    {
      "id": "co-so-ly-luan",
      "title": "Cơ sở lý luận",
      "vietnameseTitle": "Phần II: Cơ sở lý luận",
      "description": "Nêu các văn bản chỉ đạo của Bộ GD&ĐT, cơ sở khoa học, khái niệm cốt lõi liên quan đến đề tài.",
      "aiSuggestedMetrics": ["Các nghị quyết định hướng về đổi mới phương pháp", "Các định nghĩa lý luận sư phạm cốt lõi"],
      "aiSuggestedEvidences": ["Trích dẫn thông tư của Bộ", "Tài liệu lý thuyết sư phạm liên quan"]
    },
    {
      "id": "thuc-trang",
      "title": "Thực trạng",
      "vietnameseTitle": "Phần III: Thực trạng vấn đề",
      "description": "Phân tích bối cảnh, thuận lợi, khó khăn, khảo sát thống kê số liệu trước khi áp dụng giải pháp.",
      "aiSuggestedMetrics": ["Bảng số liệu khảo sát học lực/thái độ của học sinh", "Biểu đồ so sánh chất lượng đầu năm"],
      "aiSuggestedEvidences": ["Bảng điểm khảo sát trước thực nghiệm", "Biên bản khảo sát ý kiến giáo viên đồng nghiệp"]
    },
    {
      "id": "giai-phap",
      "title": "Các giải pháp thực hiện",
      "vietnameseTitle": "Phần IV: Các giải pháp/Biện pháp thực hiện",
      "description": "Mô tả chi tiết các biện pháp, phương pháp cụ thể, quy trình tiến hành giảng dạy sáng tạo.",
      "aiSuggestedMetrics": ["Các bước tổ chức trò chơi/hoạt động", "Sơ đồ tiến trình tổ chức hoạt động học"],
      "aiSuggestedEvidences": ["Kế hoạch bài dạy (Giáo án mẫu có tích hợp biện pháp)", "Hình ảnh học sinh thảo luận nhóm, học tập tích cực"]
    },
    {
      "id": "ket-qua",
      "title": "Hiệu quả của sáng kiến",
      "vietnameseTitle": "Phần V: Hiệu quả thực tiễn",
      "description": "So sánh kết quả trước và sau khi áp dụng giải pháp bằng số liệu định lượng, định tính.",
      "aiSuggestedMetrics": ["Bảng đối chiếu kết quả trước và sau thực nghiệm", "Tỷ lệ xếp loại học lực học sinh cải thiện"],
      "aiSuggestedEvidences": ["Bảng điểm đối chứng", "Bản tự nhận xét, đánh giá của học sinh và phụ huynh"]
    },
    {
      "id": "ket-luan",
      "title": "Kết luận và kiến nghị",
      "vietnameseTitle": "Phần VI: Kết luận, bài học kinh nghiệm và Kiến nghị",
      "description": "Khái quát tầm quan trọng, bài học kinh nghiệm rút ra và các kiến nghị với ban giám hiệu, phòng giáo dục.",
      "aiSuggestedMetrics": ["Bài học kinh nghiệm sư phạm sâu sắc nhất", "Kiến nghị cụ thể về cơ sở vật chất, trang thiết bị"],
      "aiSuggestedEvidences": ["Báo cáo tóm tắt sáng kiến trước Hội đồng sư phạm trường", "Văn bản đề xuất kiến nghị"]
    },
    {
      "id": "phu-luc-giao-an",
      "title": "Phụ lục giáo án",
      "vietnameseTitle": "Phụ lục: Kế hoạch bài dạy minh họa (Công văn 5512)",
      "description": "Thiết kế một Kế hoạch bài dạy (Giáo án) mẫu cụ thể minh họa việc áp dụng sáng kiến/biện pháp vào thực tế giảng dạy, tuân thủ cấu trúc của Công văn 5512/BGDĐT.",
      "aiSuggestedMetrics": ["Thời lượng tiết dạy thực nghiệm", "Số lượng học sinh phản hồi tích cực"],
      "aiSuggestedEvidences": ["Phiếu bài tập / Phiếu học tập minh họa", "Slide bài giảng điện tử hoạt động nhóm"]
    }
  ]
}

Hướng dẫn về cấu trúc khung "standardOutlines":
${outlineInstructions}

Hãy trả về phản hồi KHÔNG có bất kỳ ký tự nào nằm ngoài đối tượng JSON. Không sử dụng markdown block \`\`\`json ở bên ngoài, chỉ trả về chuỗi JSON thô để phân tích cú pháp dễ dàng.
`;

  const { isMock } = getAIClient(req);
  if (isMock) {
    const result = fallbackAnalyzeTopic(title, subject, grade, category, customOutline);
    return res.json(result);
  }

  try {
    const text = await generateContentWithRetry(req, {
      contents: prompt,
      responseMimeType: "application/json"
    });

    const parsedData = cleanAndParseJson(text);
    
    // Ghép nội dung gốc trích xuất từ file Word vào cấu trúc outlines do Gemini sinh ra
    if (parsedData && Array.isArray(parsedData.standardOutlines) && customOutline && Array.isArray(customOutline)) {
      parsedData.standardOutlines = parsedData.standardOutlines.map((outlineItem: any, idx: number) => {
        const customItem = customOutline[idx];
        if (customItem && typeof customItem === 'object' && customItem !== null && customItem.content) {
          outlineItem.content = customItem.content;
          outlineItem.status = 'completed'; // Đã có sẵn nội dung
        } else {
          outlineItem.content = outlineItem.content || "";
          outlineItem.status = outlineItem.content ? 'completed' : 'idle';
        }
        return outlineItem;
      });
    }

    res.json(parsedData);
  } catch (error: any) {
    console.error("Lỗi phân tích đề tài (đang chuyển sang fallback):", error);
    
    // Trả lỗi trực tiếp nếu liên quan đến API Key
    if (error.message && error.message.includes("API Key")) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const result = fallbackAnalyzeTopic(title, subject, grade, category, customOutline);
      res.json(result);
    } catch (fallbackErr: any) {
      res.status(500).json({ error: "Lỗi kết nối dịch vụ AI.", details: error.message });
    }
  }
});

// Helper to parse document content into structured sections based on headings
function parseDocumentToSections(text: string): { title: string, content: string }[] {
  const rawLines = text.split(/\r?\n/);
  const sections: { title: string, content: string }[] = [];
  
  let currentTitle = "Phần mở đầu";
  let currentContentLines: string[] = [];

  const headingKeywords = [
    "mở đầu", "lý do", "lý do chọn đề tài", "mục đích", "mục tiêu", "nhiệm vụ", "đối tượng", "phương pháp", "phạm vi", "giới hạn",
    "nội dung", "cơ sở lý luận", "cơ sở thực tiễn", "thực trạng", "thuận lợi", "khó khăn", "biện pháp", "giải pháp", "kết quả", "hiệu quả",
    "kết luận", "kiến nghị", "khuyến nghị", "bài học", "bài học kinh nghiệm", "khảo nghiệm", "thực nghiệm", "phụ lục", "giáo án", "kế hoạch bài dạy",
    "đóng góp", "tính mới", "tính sáng tạo", "sự cần thiết", "đánh giá", "tổ chức", "thực hiện", "khảo sát", "số liệu", "đối chứng"
  ];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    let isHeading = false;

    // A. Kiểm tra cấu trúc dấu hiệu đầu dòng (prefix regex)
    // 1. Từ khóa chương phần (không phân biệt hoa thường)
    if (/^(phần|chương|mục|tiểu\s+mục|phụ\s+lục)\b/i.test(trimmed)) {
      isHeading = true;
    }
    // 2. Chữ số La Mã: I., II., I), II) (không phân biệt hoa thường, có hoặc không có dấu cách sau)
    else if (/^[ivx]+(\.|\)|:)?\s+/i.test(trimmed) || /^[ivx]+(\.|\)|:)\s*/i.test(trimmed)) {
      isHeading = true;
    }
    // 3. Số nhiều cấp: 1.1, 1.1.1, 1.1.2 (có hoặc không có dấu cách sau)
    else if (/^[0-9]+(\.[0-9]+)+(\.|\)|:)?\s*/.test(trimmed)) {
      isHeading = true;
    }
    // 4. Số đơn cấp: 1., 1), 1: (có hoặc không có dấu cách sau)
    else if (/^[0-9]+(\.|\)|:)\s*/.test(trimmed)) {
      isHeading = true;
    }
    // 5. Chữ cái đơn: a., b), c: (không phân biệt hoa thường, có hoặc không có dấu cách sau)
    else if (/^[a-z](\.|\)|:)\s*/i.test(trimmed)) {
      isHeading = true;
    }
    // 6. Chữ cái đơn cách bằng dấu khoảng trắng: a , b 
    else if (/^[a-z]\s+/i.test(trimmed) && trimmed.split(/\s+/)[0].length === 1) {
      isHeading = true;
    }

    // B. Các Heuristic nâng cao (Cho phép nhận diện các đề mục tự động đánh số của Word đã bị loại bỏ số thứ tự khi giải nén)
    if (!isHeading && trimmed.length < 95) {
      // Heuristic 1: Dòng chữ viết hoa hoàn toàn (Ví dụ: THỰC TRẠNG ĐỀ TÀI)
      const isAllUppercase = trimmed === trimmed.toUpperCase() && /[a-zA-Z]/.test(trimmed);
      if (isAllUppercase) {
        isHeading = true;
      }
      // Heuristic 2: Chứa từ khóa học thuật thông dụng của Sáng kiến kinh nghiệm
      else {
        const containsKeyword = headingKeywords.some(kw => 
          lower.startsWith(kw) || 
          lower.includes(" " + kw)
        );
        if (containsKeyword) {
          isHeading = true;
        }
      }
    }

    // Giới hạn độ dài dòng tiêu đề để tránh nhận nhầm câu văn dài bắt đầu bằng số
    if (isHeading && trimmed.length < 95) {
      if (currentContentLines.length > 0) {
        sections.push({
          title: currentTitle,
          content: currentContentLines.join("\n\n")
        });
      }
      currentTitle = trimmed;
      currentContentLines = [];
    } else {
      currentContentLines.push(trimmed);
    }
  }

  // Push final section
  if (currentContentLines.length > 0 || sections.length === 0) {
    sections.push({
      title: currentTitle,
      content: currentContentLines.join("\n\n")
    });
  }

  return sections;
}

// 1.5. Document Parsing Route (Extracts text/outline from Word, PDF or TXT)
app.post("/api/parse-document", async (req, res) => {
  const { base64, fileName } = req.body;

  if (!base64 || !fileName) {
    return res.status(400).json({ error: "Thiếu dữ liệu tệp tin hoặc tên tệp tin." });
  }

  let text = "";
  try {
    const buffer = Buffer.from(base64, 'base64');
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value || "";
      } catch (err: any) {
        throw new Error("Lỗi khi đọc tệp Word (.docx). Hãy đảm bảo tệp của bạn không bị lỗi hoặc bị khóa: " + err.message);
      }
    } else if (lowerName.endsWith('.pdf')) {
      return res.status(400).json({ error: "Định dạng tệp PDF hiện tại chưa được hỗ trợ xử lý trực tiếp trên máy chủ Vercel. Vui lòng chuyển đổi tệp PDF của bạn sang định dạng Word (.docx) hoặc Tệp văn bản (.txt) để tiếp tục." });
    } else if (lowerName.endsWith('.txt')) {
      text = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: "Định dạng tệp không được hỗ trợ. Vui lòng tải file .docx, .pdf hoặc .txt" });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Không thể trích xuất văn bản từ tệp tin này hoặc tài liệu rỗng." });
    }

    // Direct fast regex extraction to avoid Gemini Vercel timeouts (10s Hobby limit)
    const parsedSections = parseDocumentToSections(text);
    
    res.json({
      success: true,
      fileName,
      totalLines: parsedSections.length,
      lines: parsedSections.map(s => s.title),
      sections: parsedSections // Returns the array of { title, content } for the frontend
    });

  } catch (error: any) {
    console.error("Lỗi khi xử lý tài liệu:", error);
    res.status(500).json({ error: error.message || "Không thể phân tích tệp tin. Vui lòng kiểm tra lại định dạng tệp." });
  }
});

// 2. Section Generator Route
app.post("/api/generate-section", async (req, res) => {
  const { title, subject, grade, category, sectionId, sectionTitle, description, contextOutline, existingContent } = req.body;

  if (!title || !sectionId) {
    return res.status(400).json({ error: "Thiếu thông tin đề tài hoặc phần cần viết" });
  }

  let originalContentContext = "";
  if (existingContent && String(existingContent).trim().length > 0) {
    originalContentContext = `
DƯỚI ĐÂY LÀ PHÁC THẢO / NỘI DUNG GỐC CÓ SẴN do Thầy/Cô cung cấp cho phần này:
"""
${existingContent}
"""
YÊU CẦU QUAN TRỌNG: Bạn hãy phân tích bản phác thảo gốc trên, giữ lại các ý cốt lõi, mở rộng và viết sâu sắc hơn, sửa lại theo văn phong sư phạm khoa học, sửa hoặc bổ sung số liệu minh chứng nếu cần thiết. KHÔNG tự ý bỏ qua các ý chính trong bản phác thảo trên.
`;
  }

  const prompt = `
Bạn là một chuyên gia viết Sáng kiến kinh nghiệm bậc thầy tại Việt Nam. Hãy soạn thảo nội dung chi tiết, sâu sắc, đúng chuẩn văn phong khoa học sư phạm Việt Nam cho phần dưới đây:
- Đề tài: "${title}"
- Môn học: "${subject || 'Chung'}"
- Khối lớp: "${grade || 'Mọi khối lớp'}"
- Phân loại: "${category}"
- Phần cần soạn thảo: "${sectionTitle}" (ID: ${sectionId})
- Định hướng yêu cầu phần này: "${description}"
${originalContentContext}

Yêu cầu về nội dung:
1. Viết bài bằng tiếng Việt với văn phong học thuật, chuẩn mực sư phạm, tự nhiên và giàu tính thuyết phục.
2. Nội dung phải cực kỳ chi tiết, thực tế, tránh sáo rỗng. Hãy viết từ 600 đến 1200 từ cho phần này.
3. Rất quan trọng: Nếu phần này là "Thực trạng" (thuc-trang) hoặc "Hiệu quả" (ket-qua), hãy TỰ ĐỘNG tạo các bảng biểu số liệu giả định trực quan bằng định dạng bảng Markdown (ví dụ: bảng khảo sát hứng thú học tập, bảng so sánh kết quả học tập giữa nhóm thực nghiệm và đối chứng, tỷ lệ % đạt chuẩn học tập trước/sau).
4. Nếu phần này là "Các giải pháp thực hiện" (giai-phap), hãy trình bày các giải pháp rõ ràng dạng bước 1, bước 2, giải thích rõ cách thực hiện, các giáo án mẫu hoặc ví dụ cụ thể để giáo viên áp dụng được ngay.
5. Định dạng nội dung bằng Markdown sạch sẽ (sử dụng tiêu đề phụ ##, ###, in đậm, danh sách có thứ tự, bảng biểu).

Hãy bắt đầu soạn thảo ngay lập tức, không viết các câu mở đầu hoặc kết thúc rườm rà như "Dưới đây là phần...", hãy viết thẳng vào nội dung chính thức của văn bản.
`;

  const { isMock } = getAIClient(req);
  if (isMock) {
    const text = fallbackGenerateSection(title, subject, grade, category, sectionId, sectionTitle, description);
    return res.json({ content: text });
  }

  try {
    const text = await generateContentWithRetry(req, {
      contents: prompt
    });

    res.json({ content: text || "" });
  } catch (error: any) {
    console.error("Lỗi tạo nội dung phần (đang chuyển sang fallback):", error);
    
    // Nếu là lỗi API Key không hợp lệ, trả lỗi thẳng về client
    if (error.message && error.message.includes("API Key")) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const text = fallbackGenerateSection(title, subject, grade, category, sectionId, sectionTitle, description);
      res.json({ content: text });
    } catch (fallbackErr: any) {
      res.status(500).json({ error: "Lỗi kết nối AI khi tạo nội dung phần.", details: error.message });
    }
  }
});

// 3. Evaluation & Mock Panel Route
app.post("/api/evaluate-initiative", async (req, res) => {
  const { title, subject, grade, category, outline } = req.body;

  if (!title || !outline) {
    return res.status(400).json({ error: "Thiếu dữ liệu sáng kiến để đánh giá" });
  }

  const fullContentPreview = outline.map((s: any) => `### ${s.vietnameseTitle}\n\n${s.content}`).join("\n\n");

  const prompt = `
Bạn là một hội đồng chấm thi Sáng kiến kinh nghiệm (SKKN) và Biện pháp sư phạm cấp Tỉnh. Hãy đánh giá một cách chuyên nghiệp toàn bộ bản thảo đề tài dưới đây:

- Đề tài: "${title}"
- Môn học: "${subject || 'Chung'}"
- Khối lớp: "${grade || 'Mọi khối lớp'}"
- Phân loại: "${category}"

Toàn bộ nội dung bản thảo:
${fullContentPreview}

Hãy phân tích kỹ lưỡng và trả về phản hồi dưới cấu trúc JSON chuẩn sau đây:
{
  "score": 88, // Điểm tổng kết toàn diện của sáng kiến (1 đến 100)
  "criteria": {
    "innovation": {
      "score": 85,
      "feedback": "Phân tích cụ thể tính mới, tính sáng tạo, đã thoát khỏi lối mòn cũ chưa..."
    },
    "practicality": {
      "score": 90,
      "feedback": "Đánh giá mức độ phù hợp thực tế, giáo viên khác đọc có áp dụng được ngay không..."
    },
    "methodology": {
      "score": 87,
      "feedback": "Nhận xét tính khoa học, cách trình bày cơ sở lý luận và tính lô-gíc của các chương..."
    },
    "replicability": {
      "score": 84,
      "feedback": "Khả năng nhân rộng, chuyển giao sáng kiến cho các trường học khác..."
    },
    "presentation": {
      "score": 89,
      "feedback": "Đánh giá về hình thức, số liệu thực chứng, các bảng biểu và minh chứng đã đầy đủ chưa..."
    }
  },
  "panelComments": [
    {
      "id": "judge-1",
      "name": "ThS. Nguyễn Minh Tuấn",
      "role": "Chủ tịch Hội đồng - Trưởng phòng GD&ĐT Quận/Huyện",
      "avatar": "NMT",
      "avatarColor": "from-orange-500 to-amber-500",
      "tone": "Nghiêm túc, chú trọng thực tế và tính lan tỏa",
      "comment": "Ý kiến nhận xét cụ thể, thẳng thắn về tính thực tiễn và khả năng áp dụng rộng rãi của đề tài...",
      "rating": 9 // Điểm chấm (từ 1 đến 10)
    },
    {
      "id": "judge-2",
      "name": "Cô Lê Thị Thanh Thủy",
      "role": "Ủy viên phản biện - Hiệu trưởng Trường THCS chuyên môn giỏi",
      "avatar": "LTT",
      "avatarColor": "from-purple-500 to-indigo-500",
      "comment": "Lời khuyên thực tế về tính khoa học, khuyên giáo viên nên bổ sung thêm giáo án mẫu nào và lưu ý gì trong thực tế lên lớp...",
      "rating": 8 // Điểm chấm (từ 1 đến 10)
    },
    {
      "id": "judge-3",
      "name": "ThS. Đỗ Quốc Anh",
      "role": "Ủy viên hội đồng - Thanh tra Sở GD&ĐT",
      "avatar": "DQA",
      "avatarColor": "from-emerald-500 to-teal-500",
      "comment": "Nhận xét sâu sắc dưới góc độ thanh tra, soi chiếu với các công văn đổi mới của Bộ GD&ĐT, đánh giá tính pháp lý và các văn bản chỉ đạo của đề tài...",
      "rating": 9 // Điểm chấm (từ 1 đến 10)
    }
  ],
  "suggestedQuestions": [
    {
      "question": "Câu hỏi phản biện 1 mà ban giám khảo thường hỏi khi tác giả bảo vệ sáng kiến trước hội đồng?",
      "suggestedAnswer": "Câu trả lời gợi ý cực kỳ khôn khéo, súc tích giúp giáo viên ghi điểm tuyệt đối."
    },
    {
      "question": "Câu hỏi phản biện 2...",
      "suggestedAnswer": "Gợi ý trả lời 2..."
    },
    {
      "question": "Câu hỏi phản biện 3...",
      "suggestedAnswer": "Gợi ý trả lời 3..."
    }
  ],
  "generalFeedback": "Nhận xét tổng quan nhất, lời khuyên hành động cụ thể để cải tiến nâng từ hạng Khá lên hạng Xuất sắc."
}

Hãy trả về phản hồi KHÔNG có bất kỳ ký tự nào nằm ngoài đối tượng JSON. Không sử dụng markdown block \`\`\`json ở bên ngoài, chỉ trả về chuỗi JSON thô để phân tích cú pháp dễ dàng.
`;

  const { isMock } = getAIClient(req);
  if (isMock) {
    const result = fallbackEvaluateInitiative(title, subject, grade, category, outline);
    return res.json(result);
  }

  try {
    const text = await generateContentWithRetry(req, {
      contents: prompt,
      responseMimeType: "application/json"
    });

    res.json(cleanAndParseJson(text));
  } catch (error: any) {
    console.error("Lỗi đánh giá sáng kiến (đang chuyển sang fallback):", error);
    
    // Nếu là lỗi API Key không hợp lệ, trả lỗi thẳng về client
    if (error.message && error.message.includes("API Key")) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const result = fallbackEvaluateInitiative(title, subject, grade, category, outline);
      res.json(result);
    } catch (fallbackErr: any) {
      res.status(500).json({ error: "Lỗi kết nối AI khi đánh giá đề tài.", details: error.message });
    }
  }
});

// 4. Contextual AI Chat Route
app.post("/api/chat-assistant", async (req, res) => {
  const { title, subject, grade, category, sectionTitle, content, chatHistory, userMessage } = req.body;

  if (!userMessage) {
    return res.status(400).json({ error: "Tin nhắn không được trống" });
  }

  const systemInstruction = `
Bạn là "Trợ lý AI SKKN 2026 PRO" - một người bạn đồng hành, cố vấn viết Sáng kiến kinh nghiệm, Biện pháp sư phạm siêu việt dành riêng cho giáo viên Việt Nam.
Hiện tại, giáo viên đang làm việc trên đề tài:
- Tên đề tài: "${title}"
- Môn học: "${subject || 'Chung'}"
- Khối lớp: "${grade || 'Mọi khối lớp'}"
- Phân loại: "${category}"

Họ đang mở phần biên soạn: "${sectionTitle || 'Toàn bộ tài liệu'}".
Nội dung hiện tại của phần này là:
"${content || 'Chưa có nội dung soạn thảo.'}"

Hãy trả lời câu hỏi của giáo viên một cách ân cần, chuyên nghiệp và có chiều sâu chuyên môn cao. Trực tiếp gợi ý cải tiến văn phong, định hướng giải pháp sư phạm, hoặc bổ sung số liệu minh họa cụ thể.
Nếu họ muốn viết thêm một đoạn, hãy viết mẫu giúp họ bằng tiếng Việt chuẩn mực sư phạm. Sử dụng định dạng Markdown cho cấu trúc văn bản dễ đọc.
`;

  const { isMock } = getAIClient(req);
  if (isMock) {
    const result = fallbackChatAssistant(title, subject, grade, category, sectionTitle, content, chatHistory, userMessage);
    return res.json(result);
  }

  try {
    // Format history for Gemini call
    const contents: any[] = [];
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach((msg: any) => {
        contents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const replyText = await generateContentWithRetry(req, {
      contents: contents,
      systemInstruction: systemInstruction,
    });

    res.json({ reply: replyText || "Xin lỗi, tôi gặp chút gián đoạn khi xử lý thông tin." });
  } catch (error: any) {
    console.error("Lỗi chat assistant (đang chuyển sang fallback):", error);
    
    // Nếu là lỗi API Key không hợp lệ, trả lỗi thẳng về client
    if (error.message && error.message.includes("API Key")) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const result = fallbackChatAssistant(title, subject, grade, category, sectionTitle, content, chatHistory, userMessage);
      res.json(result);
    } catch (fallbackErr: any) {
      res.status(500).json({ error: "Lỗi kết nối AI trợ lý.", details: error.message });
    }
  }
});

// 5. MS Word Document Export Route (Generates formatted DOC file)
app.post("/api/export-docx", (req, res) => {
  const { title, subject, grade, category, author, school, outline } = req.body;

  if (!title || !outline) {
    return res.status(400).json({ error: "Thiếu dữ liệu đề tài để xuất file Word" });
  }

  // Format type name
  const catName = category === 'bien-phap' 
    ? 'BIỆN PHÁP SƯ PHẠM' 
    : category === 'ho-so' 
    ? 'HỒ SƠ GIÁO VIÊN CHỦ NHIỆM GIỎI' 
    : 'SÁNG KIẾN KINH NGHIỆM';

  // Basic HTML styling matching Microsoft Word specifications
  let docContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <style>
        @page {
          size: A4;
          margin: 2cm 2cm 2cm 2.5cm; /* Standard Vietnamese Admin Doc layout */
        }
        body {
          font-family: 'Times New Roman', serif;
          line-height: 1.5;
          font-size: 14pt;
          color: #000000;
        }
        .cover-page {
          text-align: center;
          margin-top: 50px;
          height: 100%;
        }
        .school-header {
          font-size: 13pt;
          font-weight: bold;
          text-transform: uppercase;
          margin-bottom: 5px;
        }
        .department-header {
          font-size: 13pt;
          margin-bottom: 120px;
        }
        .doc-title-category {
          font-size: 16pt;
          font-weight: bold;
          margin-bottom: 40px;
          text-transform: uppercase;
        }
        .doc-title {
          font-size: 20pt;
          font-weight: bold;
          text-transform: uppercase;
          margin-bottom: 120px;
          line-height: 1.3;
        }
        .author-info {
          font-size: 14pt;
          text-align: left;
          margin-left: 150px;
          margin-bottom: 150px;
          line-height: 1.8;
        }
        .year-info {
          font-size: 14pt;
          font-weight: bold;
          margin-top: auto;
        }
        .page-break {
          page-break-after: always;
        }
        h1.section-title {
          font-size: 16pt;
          font-weight: bold;
          text-transform: uppercase;
          text-align: center;
          margin-top: 30px;
          margin-bottom: 15px;
          page-break-before: always;
        }
        h2 {
          font-size: 14pt;
          font-weight: bold;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        h3 {
          font-size: 14pt;
          font-weight: bold;
          font-style: italic;
          margin-top: 15px;
          margin-bottom: 5px;
        }
        p {
          text-align: justify;
          text-indent: 1.27cm; /* Standard Vietnamese paragraph indent */
          margin-top: 0;
          margin-bottom: 10px;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          margin: 20px 0;
        }
        table, th, td {
          border: 1px solid #000000;
        }
        th {
          background-color: #f2f2f2;
          font-weight: bold;
          text-align: center;
          padding: 8px;
          font-size: 13pt;
        }
        td {
          padding: 8px;
          font-size: 13pt;
          text-align: left;
        }
        .text-center {
          text-align: center;
        }
        .italic {
          font-style: italic;
        }
        .bold {
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      
      <!-- TRANG BÌA CHUẨN BỘ GD -->
      <div class="cover-page">
        <div class="school-header">${school || 'SỞ GIÁO DỤC VÀ ĐÀO TẠO'}</div>
        <div class="department-header">TRƯỜNG: ............................................................</div>
        
        <div style="margin-top: 80px;">&nbsp;</div>
        
        <div class="doc-title-category">BÁO CÁO CHUYÊN ĐỀ<br>${catName}</div>
        
        <div class="doc-title">"${title}"</div>
        
        <div class="author-info">
          <div><span class="bold">Tác giả:</span> ${author || '...................................................'}</div>
          <div><span class="bold">Môn học:</span> ${subject || '...................................................'}</div>
          <div><span class="bold">Khối lớp:</span> ${grade || '...................................................'}</div>
          <div><span class="bold">Năm học:</span> ${new Date().getFullYear()} - ${new Date().getFullYear() + 1}</div>
        </div>
        
        <div class="year-info">ĐỊA PHƯƠNG, NĂM KHẢO SÁT ${new Date().getFullYear()}</div>
      </div>
      
      <div class="page-break"></div>
  `;

  // Append sections
  outline.forEach((section: any) => {
    // Process markdown conversion to HTML simply
    let sectionContentHtml = section.content || `<p class="italic">Chưa có nội dung chi tiết cho phần này.</p>`;
    
    // Simple markdown helper replacements
    sectionContentHtml = sectionContentHtml
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Headers
      .replace(/### (.*?)\n/g, '<h3>$1</h3>')
      .replace(/## (.*?)\n/g, '<h2>$1</h2>')
      // Bullets
      .replace(/^- (.*?)\n/gm, '<li>$1</li>')
      // Convert standard double newlines to paragraph tags
      .split('\n\n').map((para: string) => {
        if (para.trim().startsWith('<h') || para.trim().startsWith('<li') || para.trim().startsWith('<tr') || para.trim().startsWith('<table')) {
          return para;
        }
        return `<p>${para}</p>`;
      }).join('\n');

    docContent += `
      <h1 class="section-title">${section.vietnameseTitle}</h1>
      <div class="section-body">
        ${sectionContentHtml}
      </div>
    `;
  });

  docContent += `
    </body>
    </html>
  `;

  const fileName = `SKKN_2026_${title.substring(0, 30).toUpperCase().replace(/[^A-Z0-9]/g, "_")}.doc`;

  res.setHeader('Content-Type', 'application/vnd.ms-word');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(docContent);
});

// 5.5. Generate Slides Outline Route (Summarizes the initiative into slide bullet points & speaker notes)
app.post("/api/generate-slides-outline", async (req, res) => {
  const { title, subject, grade, category, outline } = req.body;

  if (!title || !outline) {
    return res.status(400).json({ error: "Thiếu dữ liệu sáng kiến để tạo slide" });
  }

  const contentSummary = outline.map((s: any) => `### ${s.vietnameseTitle}\n\n${s.content}`).join("\n\n");

  const prompt = `
Bạn là một chuyên gia thiết kế bài thuyết trình báo cáo Sáng kiến kinh nghiệm xuất sắc.
Hãy chuyển đổi nội dung Sáng kiến kinh nghiệm dưới đây thành một cấu trúc bài thuyết trình PowerPoint (.pptx) gồm khoảng 8 - 12 slides để tác giả trình bày trước Hội đồng chấm thi trong thời gian 10 - 15 phút.

- Tên đề tài: "${title}"
- Môn học: "${subject || 'Chung'}"
- Khối lớp: "${grade || 'Mọi khối lớp'}"
- Phân loại: "${category}"

Toàn bộ nội dung đề tài:
${contentSummary}

Yêu cầu cấu trúc từng Slide cần trả về dưới dạng JSON:
1. Đầy đủ các phần lớn: Slide bìa, Lý do chọn đề tài/Mục đích, Cơ sở lý luận (ngắn gọn), Thực trạng thuận lợi khó khăn (kèm bảng số liệu nếu có), Chi tiết các giải pháp thực hiện (mỗi giải pháp nên là 1-2 slides kèm ví dụ), Kết quả đối chứng (kèm số liệu thực tế), Kết luận và Đề xuất.
2. Trình bày nội dung trên slide ngắn gọn, súc tích (dạng gạch đầu dòng bullet points), tuyệt đối không copy cả đoạn văn dài lên slide. Mỗi slide chỉ nên có 3 - 5 ý chính.
3. Cung cấp "notes" (lời thoại/speaker notes) chi tiết cho từng slide để giáo viên biết mình nên nói gì khi trình bày slide đó.

Trả về kết quả dưới định dạng JSON đúng cấu trúc sau:
{
  "slides": [
    {
      "title": "Tiêu đề Slide",
      "bullets": [
        "Ý thứ nhất ngắn gọn",
        "Ý thứ hai ngắn gọn",
        ...
      ],
      "notes": "Lời thoại chi tiết cho giáo viên khi thuyết trình slide này..."
    },
    ...
  ]
}

Hãy trả về phản hồi KHÔNG có bất kỳ ký tự nào nằm ngoài đối tượng JSON. Không sử dụng markdown block \`\`\`json ở bên ngoài, chỉ trả về chuỗi JSON thô để phân tích cú pháp dễ dàng.
`;

  const { isMock } = getAIClient(req);
  if (isMock) {
    return res.json({
      slides: [
        {
          title: `BÁO CÁO CHUYÊN ĐỀ\n${category === 'bien-phap' ? 'BIỆN PHÁP SƯ PHẠM' : 'SÁNG KIẾN KINH NGHIỆM'}`,
          bullets: [
            `Đề tài: "${title}"`,
            `Tác giả: Giáo viên môn ${subject} lớp ${grade}`,
            `Năm học: ${new Date().getFullYear()} - ${new Date().getFullYear() + 1}`
          ],
          notes: `Kính chào hội đồng chấm thi, hôm nay tôi xin trình bày báo cáo chuyên đề "${title}" áp dụng cho môn ${subject} lớp ${grade}.`
        },
        {
          title: "Lý do chọn đề tài",
          bullets: [
            "Đáp ứng yêu cầu đổi mới của chương trình GDPT 2018.",
            "Khắc phục sự thụ động, lười học môn học của học sinh.",
            "Nâng cao chất lượng dạy và học thực tế tại đơn vị nhà trường."
          ],
          notes: "Lý do tôi chọn đề tài này xuất phát từ yêu cầu đổi mới của chương trình GDPT 2018, đồng thời muốn cải thiện tinh thần học tập của các em..."
        },
        {
          title: "Thực trạng trước khi áp dụng",
          bullets: [
            "Học sinh chủ yếu nghe giảng một chiều, ghi nhớ máy móc.",
            "Tỷ lệ học sinh hứng thú học tập tích cực ban đầu rất thấp (dưới 20%).",
            "Giáo viên lúng túng trong việc thiết kế hoạt động tương tác nhóm."
          ],
          notes: "Qua khảo sát đầu năm, tôi nhận thấy đa số học sinh còn thụ động, tỷ lệ hứng thú chỉ khoảng 15-17%, điều đó khiến tôi phải trăn trở tìm ra giải pháp."
        },
        {
          title: "Các giải pháp thực hiện",
          bullets: [
            "Biện pháp 1: Thiết kế các trò chơi học tập tương tác đầu giờ (Warm-up).",
            "Biện pháp 2: Áp dụng kỹ thuật dạy học hợp tác nhóm sáng tạo (Gallery Walk).",
            "Biện pháp 3: Xây dựng hệ thống bài tập tình huống thực tiễn và phiếu tự đánh giá."
          ],
          notes: "Để giải quyết các vấn đề trên, tôi đã áp dụng 3 biện pháp cốt lõi: từ thiết kế trò chơi khởi động, dạy học nhóm phòng tranh, đến gắn lý thuyết với thực tiễn."
        },
        {
          title: "Hiệu quả thực tiễn đạt được",
          bullets: [
            "Học sinh tự tin, chủ động giao tiếp, kỹ năng làm việc nhóm tiến bộ rõ rệt.",
            "Tỷ lệ hứng thú tích cực tăng vọt từ 15% lên trên 72%.",
            "Kết quả học tập cuối năm: 42.5% xếp loại Giỏi, không còn học sinh yếu kém."
          ],
          notes: "Sau một năm thực nghiệm, kết quả đạt được rất khả quan. Tỷ lệ hứng thú tăng mạnh lên 72%, phổ điểm giỏi tăng cao và hoàn toàn xóa yếu kém."
        },
        {
          title: "Kết luận & Đề xuất",
          bullets: [
            "Bài học kinh nghiệm: Giáo viên phải đi đầu trong đổi mới và tôn trọng sự khác biệt.",
            "Đề xuất Nhà trường: Hỗ trợ nâng cấp thêm thiết bị máy chiếu thông minh.",
            "Đề xuất Phòng GD: Chia sẻ rộng rãi các sáng kiến đạt giải cao để đồng nghiệp tham khảo."
          ],
          notes: "Rút ra bài học kinh nghiệm là giáo viên cần liên tục đổi mới sáng tạo. Xin kính chúc Hội đồng chấm thi sức khỏe và mong nhận được ý kiến đóng góp."
        }
      ]
    });
  }

  try {
    const responseText = await generateContentWithRetry(req, {
      contents: prompt,
      responseMimeType: "application/json"
    });
    res.json(cleanAndParseJson(responseText));
  } catch (error: any) {
    console.error("Lỗi tạo slides outline:", error);
    res.status(500).json({ error: "Không thể tạo outline slide thuyết trình từ AI.", details: error.message });
  }
});

// 6. Interactive Council Q&A Defense Simulation Route
app.post("/api/simulate-defense", async (req, res) => {
  const { title, subject, grade, category, outline, judgeId, chatHistory, userMessage } = req.body;

  if (!userMessage || !judgeId) {
    return res.status(400).json({ error: "Thiếu tin nhắn hoặc thông tin giám khảo" });
  }

  // Get Judge profile
  const judgesList = [
    {
      id: "judge-1",
      name: "ThS. Nguyễn Minh Tuấn",
      role: "Chủ tịch Hội đồng - Trưởng phòng GD&ĐT Quận/Huyện",
      tone: "Nghiêm túc, đòi hỏi thực tiễn và tính lan tỏa rộng rãi",
      avatar: "NMT"
    },
    {
      id: "judge-2",
      name: "Cô Lê Thị Thanh Thủy",
      role: "Ủy viên phản biện - Hiệu trưởng Trường THCS chuyên môn giỏi",
      tone: "Sư phạm mẫu mực, tỉ mỉ và chú trọng vào học sinh",
      avatar: "LTT"
    },
    {
      id: "judge-3",
      name: "ThS. Đỗ Quốc Anh",
      role: "Ủy viên hội đồng - Thanh tra Sở GD&ĐT",
      tone: "Soi xét tính pháp lý, bám sát Công văn của Bộ Giáo dục và Đào tạo",
      avatar: "DQA"
    }
  ];

  const activeJudge = judgesList.find(j => j.id === judgeId) || judgesList[0];
  const contentPreview = outline ? outline.map((s: any) => `### ${s.vietnameseTitle}\n\n${s.content}`).join("\n\n") : "Không có nội dung sáng kiến.";

  const systemInstruction = `
Bạn là giám khảo ảo tên là "${activeJudge.name}" đóng vai trò "${activeJudge.role}" trong buổi bảo vệ Sáng kiến kinh nghiệm.
Tính cách của bạn khi phản biện giáo viên: "${activeJudge.tone}".

Đề tài giáo viên đang trình bày bảo vệ:
- Tên đề tài: "${title}"
- Môn học: "${subject || 'Chung'}"
- Khối lớp: "${grade || 'Mọi khối lớp'}"
- Phân loại: "${category}"

Toàn bộ nội dung sáng kiến:
${contentPreview}

Nhiệm vụ của bạn:
1. Đóng vai thật tự nhiên, xưng hô lịch sự với giáo viên (xưng "Tôi" hoặc "Hội đồng" và gọi giáo viên là "Thầy/Cô" hoặc "Tác giả").
2. Đọc câu trả lời vừa rồi của giáo viên. Đánh giá câu trả lời đó một cách sắc sảo dưới góc nhìn của vai diễn của bạn (Khen ngợi nếu hợp lý, chỉ ra lỗ hổng nếu sáo rỗng hoặc thiếu thực tế, yêu cầu làm rõ thêm).
3. Đưa ra 1 câu hỏi phản biện tiếp theo liên quan trực tiếp đến đề tài và câu trả lời của tác giả để thử thách năng lực sư phạm của tác giả.
4. Trả lời ngắn gọn, tập trung, chuẩn phong cách sư phạm, độ dài khoảng 100 - 180 từ. Định dạng bằng Markdown sạch sẽ.
`;

  const { isMock } = getAIClient(req);
  if (isMock) {
    return res.json({
      reply: `[Giám khảo ${activeJudge.name}] Cảm ơn Thầy/Cô đã trả lời. Dưới góc độ của ${activeJudge.role}, tôi ghi nhận câu trả lời này. Tuy nhiên, tôi muốn Thầy/Cô làm rõ thêm: Làm thế nào để đảm bảo tính lan tỏa và các lớp học khác trong trường có thể áp dụng biện pháp này mà không cần giáo viên phải có kỹ năng công nghệ quá cao?`
    });
  }

  try {
    const contents: any[] = [];
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach((msg: any) => {
        contents.push({
          role: msg.sender === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }]
    });

    const replyText = await generateContentWithRetry(req, {
      contents: contents,
      systemInstruction: systemInstruction,
    });

    res.json({ reply: replyText });
  } catch (error: any) {
    console.error("Lỗi mô phỏng bảo vệ:", error);
    res.status(500).json({ error: "Lỗi kết nối AI mô phỏng bảo vệ.", details: error.message });
  }
});

export default app;

// Setup Vite Dev Server / Static files handler
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

const isServerless = 
  process.env.VERCEL === "1" || 
  process.env.VERCEL === "true" ||
  process.env.NOW_REGION !== undefined || 
  process.env.LAMBDA_TASK_ROOT !== undefined || 
  process.env.AWS_EXECUTION_ENV !== undefined;

if (!isServerless) {
  startServer();
}
