# UDIKA GAME HUB – KHOA BẢNG REALTIME V3

**Bản cập nhật cho dự án `udikavietnam-code/trangnguyenudika` trên Render.**

Hệ thống hiện gồm: `/admin` (Admin UDIKA), `/host` (MC được phân quyền), `/join` (sĩ tử), `/led` (trường thi & bảng vàng). Không sử dụng mã PIN dành cho người chơi để cấp quyền MC.

## Chức năng đã triển khai trong gói V3

- Một website, nhiều phòng thi độc lập; mỗi phòng có bộ đề, số điểm và MC riêng.
- Admin dùng mật khẩu tổng; tạo phòng, cấp tài khoản MC và thay đổi MC phụ trách.
- MC đăng nhập bằng **PIN phòng + tên tài khoản + mật khẩu**, máy chủ kiểm tra quyền ở mọi lệnh điều khiển.
- MC mở câu, kết thúc, xướng bảng vàng và sang câu tiếp; chỉnh câu hỏi, đáp án, thời gian 5–120 giây.
- Người chơi vào bằng link/PIN, trả lời và được chấm điểm bằng thời gian máy chủ; câu đã nộp không được nộp lại.
- Khôi phục trên **cùng thiết bị và cùng trình duyệt**, nhờ mã phiên lưu tại localStorage (dùng lại link chứa PIN); giữ đáp án, điểm và trạng thái. **Chưa có luồng khôi phục xác thực khi chuyển sang thiết bị khác.**
- Chuyển chặng tự động khi hết một nhóm câu; màn LED và điện thoại hiển thị thông báo chúc mừng phù hợp kết quả.
- Khi hết kỳ thi, LED phong danh Trạng nguyên/Bảng nhãn/Thám hoa kèm tên người chơi thật và minh họa mũ, áo cổ phong cách điệu.
- Admin xem số người, trạng thái mỗi phòng, đổi tài khoản MC và tải kết quả CSV.
- Có thể lưu bền vững vào PostgreSQL nếu cấu hình `DATABASE_URL`; nếu không có, dùng file JSON cục bộ **không bền vững trên Render Free**.
- Có bảo vệ cookie phiên HttpOnly/SameSite, kiểm tra Origin, giới hạn đăng nhập, và mã PIN không mang quyền quản trị.

## QUAN TRỌNG: Không phải bản đã được chứng nhận 2.000 người

Gói này là **production-oriented pilot**, triển khai được lên web và có kiểm thử chức năng. Mặc định `MAX_PLAYERS=300`, `MAX_ROOMS=30`. Các bài thử đã xác minh hai phòng độc lập và hai sĩ tử; **chưa có load test 2.000 người, chưa có nhiều máy chủ/Redis adapter, chưa có giám sát tải hoặc bằng chứng SLA**. Không sử dụng để trao giải lớn trước khi bổ sung giám sát, cơ chế phân định đồng hạng, thử tải và vận hành dự phòng.

## Triển khai Render an toàn

1. **Sao lưu** mã nguồn/ kết quả và chụp lại cấu hình website hiện tại. Nên deploy thử vào Web Service mới thay vì ghi đè website khách đang dùng.
2. Giải nén gói ZIP và đưa các file **bên trong** `UDIKA_KHOA_BANG_REALTIME` vào đúng thư mục `UDIKA_KHOA_BANG_REALTIME/` của repo GitHub. `server.js`, `package.json`, `questions.json`, `public/` phải cùng tầng trong thư mục này.
3. Render Web Service Node, Branch `main`, Root Directory `UDIKA_KHOA_BANG_REALTIME`, Build `npm install`, Start `npm start`, Region Singapore.
4. Vào Render → **Environment** và tạo các biến **bắt buộc**:
   - `ADMIN_PASSWORD` = mật khẩu mạnh tự đặt, **ít nhất 12 ký tự**; không dùng tên công ty hay giá trị trong tài liệu.
   - `SESSION_SECRET` = chuỗi ngẫu nhiên, **ít nhất 24 ký tự**, không được chia sẻ hoặc đưa vào GitHub.
5. Nên tạo Render PostgreSQL, đặt `DATABASE_URL` là **Internal Database URL**. Không dán URL có thông tin kết nối lên GitHub/ChatGPT; nhập trực tiếp trong Render Environment. Nếu Render yêu cầu SSL dùng `DATABASE_SSL=require` (chỉ cho kết nối yêu cầu SSL).
6. Tùy thử tải có thể đặt `MAX_PLAYERS=300`, `MAX_ROOMS=30`; **không tăng lên 2000** để coi như đã kiểm thử.
7. Deploy, kiểm tra `https://<domain>/health`, `/admin`, `/host`, `/join`, `/led`.
8. Vào `/admin` đăng nhập bằng `ADMIN_PASSWORD`, tạo sự kiện và tài khoản MC. Gửi MC mã phòng + tên tài khoản + mật khẩu bằng kênh riêng; người chơi chỉ nhận link `/join?pin=XXXXXX`. MC mở `/host?pin=XXXXXX`, màn LED mở `/led?pin=XXXXXX`.
9. **Trên Render Free**, khi máy chủ ngủ/khởi động lại, PostgreSQL giữ điểm; nếu không có `DATABASE_URL` dữ liệu có nguy cơ mất. Dù có PostgreSQL, mỗi room đang lưu snapshot; bản này chỉ nên thử với nhóm nhỏ.

### Lưu ý cập nhật từ bản cũ

- Quy trình tạo phòng trước đây nằm trong MC bằng `hostKey`; nay **Admin phải tạo phòng rồi cấp quyền MC**.
- Nếu phòng cũ được phục hồi từ dữ liệu, Admin cần cấp lại MC trên trang `/admin`.
- Việc thay đổi `SESSION_SECRET` làm phiên đăng nhập MC/Admin hết hạn; **không làm mất điểm nếu dữ liệu đã được lưu bền vững**.
- Khởi động máy chủ từ V3 khi thiếu hai biến bắt buộc sẽ báo lỗi có chủ đích để tránh để lộ chức năng quản trị.

## Hướng dẫn trò chơi 5 chặng

Lớp thầy đồ → Khảo hạch → Thi Hương → Thi Hội → Thi Đình. Khi qua chặng, máy chủ phát trạng thái `intermission`; màn LED hiển thị lời chúc và MC nhấn “Mở câu hỏi” để sang chặng mới.

- **Hoàn thành chặng**: tham gia hết số câu của chặng.
- **Thi đỗ chặng**: đúng ít nhất 50% số câu trong chặng. Đây là quy tắc hiện tại của pilot; sau này cần chuyển thành một tùy chọn Admin.
- Kết thúc cuối: hạng 1 Trạng nguyên, hạng 2 Bảng nhãn, hạng 3 Thám hoa. **Bản này chưa tự phân định các kết quả hòa tuyệt đối bằng câu hỏi phụ**.

## Bảo mật và khôi phục

- Password MC được băm `scrypt` và có salt; Admin password đọc từ biến môi trường.
- Cookie phiên ký HMAC, HttpOnly và SameSite Strict, hiệu lực tối đa 12 giờ.
- `playerId` thực tế là mã khôi phục bí mật; máy chủ không gửi mã này trong danh sách bảng vàng công khai.
- Khi người chơi mở lại `/join?pin=...` trên trình duyệt cũ, hệ thống tìm playerId trong localStorage, khôi phục đáp án và điểm.
- **Đổi máy/đổi trình duyệt** cần chức năng xác thực khôi phục riêng ở phiên bản sau.

## Kiểm thử

- `node --check server.js` và `node --check public/*.js` kiểm tra cú pháp.
- `node test/smoke-prod.js` là thử nghiệm HTTP API tích hợp cơ bản, cần Node 20+.
- `python test/test_integration.py` thử nghiệm nhiều phòng, phân quyền MC, WebSocket, ghi điểm, thoát/vào lại và xướng danh; cần Python + `websocket-client` trên máy chạy kiểm thử.
- Để triển khai quy mô lớn: thử tải theo đợt 100 → 300 → 500 → 1.000 → 2.000 kết nối, tập trung nộp đáp án trong 1–3 giây cuối; theo dõi P95/P99, error rate, CPU, RAM, kết quả không trùng lặp; kiểm thử restart và failover.

## Tính năng cần phát triển thêm trước thương mại lớn

- Tách dữ liệu phòng/sĩ tử/đáp án thành các bảng DB, transaction ghi đáp án, idempotency key và hàng đợi; phiên bản hiện tại dùng snapshot.
- Redis pub/sub và nhiều realtime instance, điều phối sticky session nếu cần.
- Phân quyền MC theo nhiều phòng, quản lý MC có thể chuyển quyền an toàn; nhật ký thao tác được lưu bền vững.
- Câu hỏi phụ phân định đồng hạng, quy định xử lý khiếu nại chính thức.
- Thu hồi phiên theo server và cơ chế xác minh khi đổi thiết bị.
- Bộ hoạt cảnh cổ phục được nhà nghiên cứu kiểm chứng lịch sử trước khi hoàn thiện bản 3D/2D cuối.
