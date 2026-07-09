import pptxgen from "pptxgenjs";

/**
 * Xuất dữ liệu slide thành tệp tin PowerPoint (.pptx) chất lượng cao
 * @param title Tiêu đề đề tài
 * @param category Phân loại đề tài
 * @param slidesData Mảng chứa dữ liệu các slide từ AI
 */
export function exportSlidesToPptx(title: string, category: string, slidesData: any[]) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16X9';

  slidesData.forEach((slideItem, index) => {
    const slide = pptx.addSlide();
    
    // Đính kèm ghi chú thuyết trình (Speaker Notes)
    if (slideItem.notes) {
      slide.addNotes(slideItem.notes);
    }

    if (index === 0) {
      // 1. TRANG BÌA (Cover Slide Layout)
      // Nền sáng tinh tế
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0,
        y: 0,
        w: '100%',
        h: '100%',
        fill: { color: 'F8FAFC' }
      });
      
      // Khối màu trang trí bên trái
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0.6,
        y: 1.2,
        w: 0.15,
        h: 4.8,
        fill: { color: '7C3AED' } // Màu tím chủ đạo
      });

      // Tên báo cáo chuyên đề (loại báo cáo)
      const catLabel = category === 'bien-phap' 
        ? 'BÁO CÁO BIỆN PHÁP SƯ PHẠM THI GIÁO VIÊN GIỎI' 
        : category === 'ho-so' 
        ? 'BÁO CÁO HỒ SƠ GIÁO VIÊN CHỦ NHIỆM GIỎI' 
        : 'BÁO CÁO SÁNG KIẾN KINH NGHIỆM CẤP TRƯỜNG/HỘI ĐỒNG';

      slide.addText(catLabel, {
        x: 1.0,
        y: 1.2,
        w: 11,
        h: 0.4,
        fontSize: 14,
        bold: true,
        fontFace: 'Arial',
        color: 'FF6B00', // Accent màu cam
        tracking: 1
      });

      // Tiêu đề đề tài sáng kiến
      slide.addText(`"${title}"`, {
        x: 1.0,
        y: 1.8,
        w: 11,
        h: 2.2,
        fontSize: 26,
        bold: true,
        fontFace: 'Arial',
        color: '1E293B',
        verticalAlign: 'top',
        lineSpacing: 34
      });

      // Thông tin tác giả
      let metaY = 4.2;
      slideItem.bullets.forEach((bullet: string) => {
        slide.addText(bullet, {
          x: 1.0,
          y: metaY,
          w: 11,
          h: 0.4,
          fontSize: 14,
          fontFace: 'Arial',
          color: '64748B'
        });
        metaY += 0.45;
      });

    } else {
      // 2. TRANG NỘI DUNG (Content Slide Layout)
      // Tiêu đề Slide
      slide.addText(slideItem.title, {
        x: 0.6,
        y: 0.4,
        w: 12.0,
        h: 0.8,
        fontSize: 20,
        bold: true,
        fontFace: 'Arial',
        color: '7C3AED',
        verticalAlign: 'middle'
      });

      // Đường kẻ phân cách tinh tế
      slide.addShape(pptx.shapes.RECTANGLE, {
        x: 0.6,
        y: 1.2,
        w: 12.1,
        h: 0.02,
        fill: { color: 'E2E8F0' }
      });

      // Nội dung dạng gạch đầu dòng (được căn chỉnh khoảng cách hợp lý)
      let bulletY = 1.6;
      slideItem.bullets.forEach((bullet: string, bulletIdx: number) => {
        slide.addText(bullet, {
          x: 0.9,
          y: bulletY,
          w: 11.5,
          h: 0.65,
          fontSize: 14,
          fontFace: 'Arial',
          color: '334155',
          bullet: { type: 'number' },
          bulletColor: 'FF6B00',
          lineSpacing: 20
        });
        bulletY += 0.85;
      });
    }
  });

  const cleanTitle = title.substring(0, 15).toUpperCase().replace(/[^A-Z0-9]/g, "_");
  pptx.writeFile({ fileName: `SLIDE_BAO_CAO_SKKN_2026_${cleanTitle}.pptx` });
}
