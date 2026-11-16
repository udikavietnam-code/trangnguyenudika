# UDIKA GAME HUB V3.1 – PostgreSQL trên Render

## Bản cập nhật này làm gì?

- Giữ các giao diện `/admin`, `/host`, `/join`, `/led` và chức năng đa phòng/khôi phục phiên từ bản V3.
- Tiếp tục dùng PostgreSQL với bảng `udika_snapshot` (JSONB) trong mã nguồn V3. Máy chủ tự tạo bảng khi khởi động nếu `DATABASE_URL` hợp lệ.
- Thêm `REQUIRE_DATABASE=true`: ứng dụng **không được khởi động với lưu trữ file tạm** khi bật chế độ này.
- Mở rộng `/health`: trả thêm `persistence.mode`, `persistence.ready`, `persistence.lastSavedAt` và trạng thái lỗi ghi DB (không bao gồm URL hoặc mật khẩu).
- Giảm thời gian gộp ghi snapshot từ 350 ms xuống 150 ms. **Vẫn có cửa sổ mất dữ liệu chưa kịp lưu**, chưa có transaction riêng cho từng đáp án. Chưa dùng để trao giải lớn/2.000 người.

## Cách triển khai an toàn

**1. Sao lưu** mã nguồn GitHub và xuất kết quả các phòng hiện tại. Hạn chế cập nhật khi có MC hoặc người chơi đang thi. Bản dữ liệu trên Render Free có thể đã mất nếu dịch vụ từng khởi động lại.

**2. Tạo PostgreSQL** trong [Render Dashboard](https://dashboard.render.com/): `+ New` → `Postgres`. Đặt tên, chọn **Singapore** (cùng region với Web Service `trangnguyenudika`), chọn gói dữ liệu sau khi kiểm tra điều kiện/chi phí. Đối với bản thử nghiệm, có thể dùng gói Free nếu tài khoản cho phép; **Render Free Postgres hết hạn sau 30 ngày, không có backup và không thích hợp lưu kết quả lâu dài**. Đối với hoạt động thương mại phải dùng gói trả phí và backup.

**3. Kết nối riêng tư**: Trong trang database, mở **Connect/Info** và sao chép **Internal Database URL**. Không sao chép URL vào GitHub hoặc gửi qua Zalo/ChatGPT. `Internal Database URL` chỉ dùng nếu DB và Web Service cùng workspace/region.

**4. Trên Web Service `trangnguyenudika`** mở `Environment` → `Edit`; thêm:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | Internal Database URL từ database vừa tạo |
| `REQUIRE_DATABASE` | `true` |

Giữ `ADMIN_PASSWORD` và `SESSION_SECRET` hiện tại (nếu hai giá trị đã từng lộ trong ảnh, phải thay mới trước khi sử dụng). Không đặt `DATABASE_SSL=require` khi sử dụng Internal URL thông thường; chỉ cấu hình SSL nếu phương thức kết nối của bạn thực sự yêu cầu.

**5. Đưa mã nguồn V3.1 lên GitHub**. Repository bạn đang dùng: `udikavietnam-code/trangnguyenudika`. Theo ảnh trước đó, bản V3 đang nằm trong thư mục **lồng nhau** `UDIKA_KHOA_BANG_REALTIME/UDIKA_KHOA_BANG_REALTIME`. Tải các file **bên trong** thư mục `UDIKA_KHOA_BANG_REALTIME` của ZIP này vào **đúng thư mục lồng đang chạy**. Không tạo thư mục cùng tên thứ ba. Hoặc chuẩn hóa lại repo và thay Root Directory tương ứng sau khi sao lưu.

**6. Kiểm tra Render**: Root Directory phải khớp với đường dẫn chứa `package.json`. Build `npm install`, Start `npm start`. Triển khai bản mới chỉ sau khi tạo DB và cấu hình đủ biến môi trường.

**7. Xác nhận**: Mở `https://trangnguyenudika.onrender.com/health`. Kết quả mong đợi:

```json
{
  "ok": true,
  "rooms": 0,
  "persistence": {
    "mode": "postgresql",
    "required": true,
    "ready": true,
    "lastSavedAt": null,
    "error": null
  }
}
```

`rooms` và `lastSavedAt` sẽ đổi sau khi có người chơi/phòng được lưu. Nếu `mode` là `temporary-file`, **chưa cấu hình thành công DB**. Nếu `ok=false` hoặc 503, cần kiểm tra Logs.

**8. Thử khả năng lưu lại**: Tạo một phòng thử, cho 2 máy khác nhau tham gia, MC mở/đóng 1 câu, ghi lại điểm, rồi chủ động restart trong môi trường thử nghiệm và xác nhận phòng, đáp án, điểm được tải lại từ PostgreSQL. Khi khởi động lại, câu đang mở có thể chuyển sang trạng thái công bố để tránh kéo dài thời gian; MC tiếp tục theo quy trình.

## Giới hạn phải biết

- V3.1 đang lưu **snapshot toàn hệ thống vào một hàng JSONB**. Cách này có thể phù hợp kiểm tra nhóm nhỏ, nhưng chưa tối ưu tải cao và không đảm bảo transaction từng đáp án. Không được coi là đạt 2.000 người chỉ vì đã kết nối PostgreSQL.
- Gói Free Web Service có thể ngủ khi không hoạt động. PostgreSQL trả phí/bền vững giữ dữ liệu nhưng không tự giải quyết vấn đề mất kết nối, hiệu năng realtime hoặc bảo mật của toàn hệ thống.
- Bản này không tự chuyển kết quả cũ từ file tạm sang DB. Trước khi cập nhật, hãy xuất các bảng điểm cần giữ. Không tự nhận rằng dữ liệu cũ sẽ xuất hiện ở database mới.
- Với giải đấu thật: cần transaction cho từng đáp án, audit log, backup/restore, quản lý đồng hạng, và load test theo các mốc 100 → 300 → 500 → 1.000 → 2.000.

## Kiểm tra cục bộ

```sh
node --check server.js
npm test
```

`npm test` kiểm tra đường đi cơ bản bằng file tạm, **không thay thế bài kiểm thử thực tế trên PostgreSQL**.
