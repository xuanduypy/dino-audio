"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DiNo page error:", error);
  }, [error]);

  return (
    <main className="app-error-page">
      <section className="app-error-card" role="alert">
        <span className="app-error-mark" aria-hidden="true">D</span>
        <p className="overline">DINO</p>
        <h1>Đã có lỗi xảy ra</h1>
        <p>DiNo chưa thể tải nội dung này. Hãy thử lại; thư viện của bạn vẫn được giữ nguyên.</p>
        <button className="primary-button" type="button" onClick={reset}>
          Thử tải lại
        </button>
        {error.digest && <small>Mã lỗi: {error.digest}</small>}
      </section>
    </main>
  );
}
