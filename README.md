
## Ephemeral session / privacy

- Mỗi SSH session bị giới hạn cứng ở **60 phút** từ lúc SSH shell kết nối thành công. Server chủ động đóng SSH, SFTP và WebSocket khi hết hạn.
- Không có database, Redis, persistent cache hoặc lịch sử terminal trong ứng dụng.
- Password, private key và passphrase **không được ghi vào localStorage/sessionStorage**; chúng chỉ tồn tại trong React/browser memory và server memory của connection hiện tại, sau đó được xóa/thả tham chiếu khi disconnect.
- `sessionStorage` chỉ lưu metadata không bí mật của phiên đang hoạt động (`expiresAt`) và được xóa khi disconnect, timeout hoặc tab/page bị unload.
- API phản hồi với `Cache-Control: no-store, no-cache` để tránh cache HTTP cho endpoint WebSocket.
- Terminal scrollback chỉ tồn tại trong RAM của tab hiện tại; ứng dụng không persist nội dung command/output.

Lưu ý: hạ tầng hosting/proxy có thể có access logs riêng ngoài code ứng dụng. Không đưa password/private key vào URL, query string hoặc log; nếu cần mức riêng tư nghiêm ngặt, hãy cấu hình retention/logging trên nền tảng deploy tương ứng.
