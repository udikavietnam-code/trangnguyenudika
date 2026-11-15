# UDIKA — TRƯỜNG THI KHOA BẢNG (Realtime pilot)

Phiên bản thử nghiệm **nhiều thiết bị thật**, thiết kế cho các sự kiện Gala / trường học. Gồm:

- **MC / Chủ phòng** `/host`: tạo phòng thi mã PIN 6 số, điều khiển mở câu / công bố đáp án và bảng vàng / sang câu; chỉnh bộ câu hỏi và thời gian 5–120 giây/câu.
- **Sĩ tử** `/join`: nhập PIN hoặc mở link có sẵn PIN, ghi danh, chọn avatar, nhận câu hỏi và gửi đáp án. Máy chủ ghi nhận thời gian và tính điểm.
- **Màn LED** `/led?pin=123456`: bối cảnh trường thi Việt Nam cổ theo lối đi giữa, lều chõng hai bên, bảng đề, trống trường và xướng danh sau từng câu.
- **Backend WebSocket realtime** trong `server.js`: quản lý nhiều phòng thi độc lập, tính điểm và thời gian trên máy chủ; báo kết quả sau mỗi câu.

## Chạy thử trên máy tính

Cài Node.js 20+ và mở Terminal ở thư mục chứa `package.json`:

```bash
npm start
```

Mở `http://localhost:3000/host` để tạo phòng; `http://localhost:3000/join` để tham gia; `http://localhost:3000/led?pin=<mã phòng>` để mở màn LED. Trong các máy cùng Wi-Fi dùng IP LAN của máy chủ thay `localhost`.

**Không cần `npm install`:** bộ thử nghiệm này chỉ dùng thư viện có sẵn trong Node.js, không có package ngoài. `npm install` vẫn chạy được.

### Triển khai lên Render (Web Service — Node)

1. Tạo **repository GitHub MỚI** dành cho mã nguồn này (ví dụ `udika-khoa-bang-realtime`). Không ghi đè website UDIKA đang hoạt động trước khi thử nghiệm thành công.
2. Tải **toàn bộ nội dung** thư mục này lên repo sao cho `server.js`, `package.json`, `questions.json`, `public/` cùng nằm ở thư mục gốc.
3. Tạo Render **Web Service** chọn `Node`, branch `main`, Root Directory để trống, Build Command `npm install`, Start Command `npm start`.
4. Với nhóm thử nghiệm nhỏ, có thể chọn Free nếu có sẵn; lưu ý Free có thể tạm ngủ, mất dữ liệu JSON sau redeploy/restart.
5. Khi trạng thái `Live`, mở `https://<tên-service>.onrender.com/host`, tạo phòng. Gửi **chỉ** link `/join?pin=...` cho sĩ tử, mở `/led?pin=...` trên màn LED.
6. Kiểm thử 5–10 thiết bị riêng thật trước khi mời nhóm lớn.

## Nguyên tắc chấm điểm

- Mỗi câu có giới hạn thời gian riêng 5–120 giây.
- Mỗi sĩ tử chỉ gửi một câu trả lời cho mỗi câu.
- Chỉ đáp án đúng mới nhận điểm; điểm từ 300 đến gần 1.000 tùy thời gian trả lời trên máy chủ.
- Bảng vàng chỉ hiện đáp án đúng và xếp hạng sau giai đoạn `reveal`, không tiết lộ đáp án trước khi khóa câu.
- Khi bằng điểm, ưu tiên số câu đúng, tổng thời gian trả lời đúng, thời điểm ghi danh.

## Giới hạn quan trọng — chưa sẵn sàng cho 2.000 người

Đây là **production architecture pilot**, không phải bản production đã được chứng nhận tải. Chức năng thực tế và sức chịu tải cần phân biệt:

- **Đã triển khai:** nhiều phòng thi, MC, sĩ tử, LED, WebSocket, mã PIN/khóa MC, sửa đề, thời gian từng câu, bảng vàng riêng.
- **Mặc định giới hạn kỹ thuật để tránh thử nghiệm quá tải:** 300 người/phòng, 30 phòng/server. Có thể chỉnh biến môi trường `MAX_PLAYERS`, `MAX_ROOMS`, nhưng **không đồng nghĩa** hệ thống đủ chịu tải.
- **Dữ liệu lưu file JSON cục bộ.** Render Free không có đĩa bền vững; dữ liệu có thể mất khi deploy/restart/đổi máy. Chỉ dùng làm pilot.
- **Chưa có:** tài khoản chủ sự kiện, bảo mật/rate limit đủ cho Internet công khai quy mô lớn, hạn chế tạo phòng ẩn danh, chống gian lận mạnh, giám sát, backup, chịu tải nhiều instance, cơ chế đo bù độ trễ mạng, kiểm thử với 2.000 người thật.
- **Không dùng ngay với giải thưởng giá trị cao:** đang chấm theo thời điểm server nhận đáp án, có thể bị tác động bởi độ trễ mạng.
- QR trong màn MC sử dụng dịch vụ ảnh QR công khai của `api.qrserver.com`. Nếu muốn hoàn toàn riêng tư, thay bằng thư viện QR chạy nội bộ.

### Checklist trước khi tổ chức sự kiện 2.000 người

1. Chuyển lưu trữ người chơi, câu trả lời, bộ đề và kết quả sang PostgreSQL; session/room state sang Redis.
2. Thiết kế đăng nhập MC, bảo vệ API tạo phòng, giới hạn yêu cầu và chống spam.
3. Hỗ trợ WebSocket qua nhiều máy chủ (Redis pub/sub/adapter hoặc hệ thống pub-sub tương đương), reconnect/resume và phát đồng hồ theo thời gian máy chủ.
4. Chạy tải theo từng cấp 100, 500, 1.000, 2.000 người với các đợt trả lời cùng lúc trong 5–10 giây; đo p95/p99, error rate, memory, CPU và tính nhất quán điểm.
5. Dùng gói hạ tầng luôn bật có khả năng scale, xác nhận ngân sách trước khi deploy và làm tổng duyệt mạng Wi-Fi/4G/5G tại địa điểm.
6. Thiết lập chốt danh sách Top 3 có biên bản và bản sao lưu kết quả.

## Tệp chính

- `server.js`: máy chủ HTTP, WebSocket, điểm và phòng thi.
- `questions.json`: bộ đề mặc định 15 câu.
- `public/host.html`, `host.js`: bảng MC.
- `public/player.html`, `player.js`: giao diện sĩ tử.
- `public/led.html`, `led.js`, `scene.js`: màn LED trường thi xưa.
- `test/smoke.js`: kiểm tra tạo phòng, hai người chơi, màn LED, chấm điểm, công bố và chuyển câu.

Chạy thử: `npm test`.
