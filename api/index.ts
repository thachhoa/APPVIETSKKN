// Vercel Serverless Function entrypoint wrapping the Express app
// Bọc cụm khởi chạy để bắt lỗi nạp module nếu có (ví dụ: thiếu dependencies trên Vercel)
const appPromise = import("../server").catch(err => {
  console.error("Lỗi import server ở startup:", err);
  return {
    default: (req: any, res: any) => {
      res.status(500).json({
        error: `Lỗi khởi động: ${err.message}. Chi tiết: ${err.stack || "Không có stack"}`,
        details: err.message,
        stack: err.stack
      });
    }
  };
});

export default async function handler(req: any, res: any) {
  const appModule = await appPromise;
  const app = appModule.default || appModule;
  return app(req, res);
}
