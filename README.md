# web-animation17

**🔴 Live demo: <https://nguyenthong251.github.io/web-animation17/>**

Bản clone 1:1 của [sweet-tape.com](https://sweet-tape.com/) (SweetTape — "Stick By You", băng keo Malaysia, Awwwards Site of the Day), phục vụ mục đích học tập / nghiên cứu kỹ thuật. Toàn bộ thương hiệu, nội dung, ảnh, model 3D, âm thanh và thiết kế thuộc về chủ sở hữu gốc.

## Stack (khớp site gốc)

- **Next.js App Router (React Server Components)**, build bằng **Turbopack**, nội dung từ **Payload CMS** (`/api/media/file/*`)
- Model 3D cuộn băng keo `.glb` (Three.js), 14 hiệu ứng âm thanh tương tác
- Font: Typekit `futura-pt-condensed` (nạp từ use.typekit.net như bản gốc), Inter Tight Variable + Nothing You Could Do (next/font, self-host)
- 13 route: `/`, `/products`, 6 trang sản phẩm, `/about`, `/news`, 2 bài tin, `/contact`

## Cách clone

Giữ nguyên bản build gốc (tải byte-for-byte), không build lại:

- `public/` = 284 file / ~29 MB: HTML SSR của 13 route, toàn bộ `_next/static`, `/assets`, media Payload, model GLB, âm thanh, icon/manifest. Đã quét closure mọi tham chiếu trong HTML/JS/CSS/RSC → chỉ còn 2 file mà **chính bản gốc cũng 404** (`/assets/sticky-note.png`, `/assets/sounds/tape-cut.mp3`).
- `public/__rsc/<route>/{full,pf,tree}.rsc` — payload RSC của từng route (navigation đầy đủ, prefetch, prefetch `/_tree`).
- `server.mjs` — static server không phụ thuộc: MIME đúng (wav/glb/rsc/webmanifest), HTTP Range, CORS.
- `scripts/capture/` — các script đã dùng để capture, lấp asset thiếu, lấy RSC, lắp ráp và kiểm thử A/B.

### Khác biệt so với bản gốc (cố ý)

Chỉ chèn một shim vào `<head>` mỗi trang + đổi URL GA; bundle JS giữ nguyên:

- **Soft navigation trên host tĩnh**: router Next gửi request RSC kèm header (`RSC`, `Next-Router-Prefetch`, `Next-Router-Segment-Prefetch`) mà host tĩnh không phân biệt được → shim `fetch` trả payload RSC đã capture của đúng route, nên chuyển trang vẫn mượt như bản gốc (không reload).
- **Form liên hệ** (`POST /api/messages`) được trả lời tại chỗ → hiện "SENT — WE'LL BE IN TOUCH" nhưng **không gửi dữ liệu đi đâu**.
- **Google Analytics (G-9DT4VY7JGP) bị tắt**: bật cờ opt-out và trỏ `gtag.js` (trong HTML lẫn RSC) về file rỗng `__clone/no-ga.js`.
- Bỏ `robots.txt` / `sitemap.xml` (trỏ về domain gốc).

## Chạy local

```bash
npm run dev    # http://localhost:4700
```

## Deploy

Build gốc compile cho basePath `""`, nên GitHub Actions rebase một bản copy sang `/web-animation17/` bằng `scripts/subpath.mjs`: thuộc tính HTML (kể cả `data-*` chứa đường dẫn model/ảnh, danh sách nối bằng `|`), flight data RSC, `url()` trong CSS, literal `/assets/` trong JS, chunk base của Turbopack, và 3 hàm basePath của router (`addBasePath` được làm idempotent vì component link của site push lại `href` đã có base). Link route trong RSC không bị đụng — router tự thêm base. Có bước hậu kiểm: còn sót đường dẫn asset chưa prefix là build fail.

## Verify

Playwright headless GPU thật (ANGLE D3D11), A/B với origin trên cả 13 route:

- Text hiển thị **giống hệt** 13/13 route; số h1/h2/h3/img/svg/link khớp; cùng 1 lỗi 404 vốn có ở origin.
- So ảnh bằng 13 agent độc lập: 11 identical, 2 chỉ lệch pha animation (cuộn băng đang xoay).
- Soft navigation: 5/5 lần chuyển trang không reload, title đúng — cả ở root lẫn subpath `/web-animation17/`.
- Form liên hệ: "SENT", 0 request POST rời trang. Không còn request tới Google Analytics.
