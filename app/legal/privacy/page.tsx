import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quyền riêng tư',
  description: 'Ú Nồ thu thập những gì, lưu ở đâu, và giữ trong bao lâu.',
  alternates: { canonical: '/legal/privacy' },
  robots: { index: true, follow: true },
};

const UPDATED = '13/09/2026';

export default function PrivacyPage() {
  return (
    <>
      <h1>Quyền riêng tư</h1>
      <p className="muted">Cập nhật {UPDATED}</p>

      <p>
        Ú Nồ <strong>không có tài khoản, không đăng nhập, không theo dõi, không quảng cáo</strong> và
        không có mã phân tích của bên thứ ba. Dưới đây là toàn bộ dữ liệu game thật sự chạm tới.
      </p>

      <h2>1. Lưu trong trình duyệt của bạn (không rời khỏi máy)</h2>
      <ul>
        <li>
          <strong>Cài đặt</strong> — tên hiển thị, avatar mặc định, âm lượng, mức đồ hoạ, chủ đề
          nền, ngôn ngữ. Lưu ở <code>localStorage</code>.
        </li>
        <li>
          <strong>Mã người chơi</strong> — một chuỗi ngẫu nhiên sinh tại máy, để server nhận ra bạn
          khi kết nối lại. Không gắn với email, số điện thoại hay tài khoản nào.
        </li>
        <li>
          <strong>Vé phòng</strong> — token của từng phòng đã vào, để F5 giữa ván vẫn về đúng ghế.
        </li>
        <li>
          <strong>Ảnh đại diện tự tải lên</strong> — bản gốc lưu ở <code>IndexedDB</code> ngay trong
          trình duyệt và không đi đâu cả. Khi bạn vào một phòng online, một <em>bản thu nhỏ</em>
          (128px) được gửi lên để những người cùng bàn nhìn thấy bạn — xem mục 2.
        </li>
      </ul>
      <p>
        Xoá dữ liệu trang web trong trình duyệt là xoá sạch toàn bộ mục này. Không có bản sao ở nơi
        khác.
      </p>

      <h2>2. Gửi lên máy chủ khi chơi online</h2>
      <p>Chỉ khi bạn tạo hoặc vào một phòng online. Chơi với bot thì không có gì rời khỏi máy bạn.</p>
      <ul>
        <li>Mã người chơi, <strong>tên hiển thị</strong>, số hiệu avatar mặc định.</li>
        <li>
          <strong>Ảnh đại diện</strong>, nếu bạn có đặt: bản thu nhỏ 128px của ảnh bạn tải lên, hoặc
          đường dẫn ảnh Discord khi chơi qua Discord Activity. Đây là thứ duy nhất cho người cùng
          bàn thấy mặt bạn — không lưu thì không truyền cho nhau được.
        </li>
        <li>Trạng thái ván đấu: bài trên tay, lượt, luật nhà, chủ đề nền của phòng.</li>
        <li>
          Một cờ &ldquo;đang online&rdquo; kèm <strong>độ trễ mạng</strong> (ms) để bàn biết ai vừa
          rớt mạng.
        </li>
      </ul>
      <p>
        Tất cả nằm trong Firebase Realtime Database của <em>người dựng máy chủ</em>, gắn với ĐÚNG một
        phòng, và <strong>tự hết hạn sau 6 giờ</strong> cùng phòng đó. Rời phòng thì ghế và ảnh đại
        diện của bạn bị xoá ngay. Không có lịch sử ván đấu, không có bảng xếp hạng toàn cầu, không có
        hồ sơ lâu dài — lần sau vào phòng khác là bắt đầu lại từ đầu.
      </p>
      <p>
        Nói rõ: ảnh và tên ở đây <strong>ai trong phòng cũng đọc được</strong> — đó chính là mục đích
        của chúng. Đừng đặt ảnh hay tên mà bạn không muốn người cùng bàn nhìn thấy.
      </p>

      <h2>3. Khi chạy trong Discord</h2>
      <p>
        Ở dạng Discord Activity, trang đọc các tham số Discord đặt sẵn trên URL (
        <code>frame_id</code>, <code>instance_id</code>) để biết mình đang chạy trong Discord và để
        suy ra một mã phòng mặc định cho voice channel đó.
      </p>
      <p>
        Ứng dụng có <strong>xin quyền <code>identify</code> của Discord</strong> để lấy{' '}
        <strong>tên hiển thị và ảnh đại diện</strong> của bạn, cho khỏi phải gõ tay mỗi lần vào.
        Discord sẽ hiện hộp xác nhận trước khi cấp. Ngoài hai thứ đó, ứng dụng{' '}
        <strong>không đọc tin nhắn, không đọc danh sách bạn bè, không đọc server nào</strong>, và
        cũng không lưu mã tài khoản Discord của bạn ở đâu cả — chỉ tên và đường dẫn ảnh, sống trong
        phòng đang chơi rồi hết hạn cùng phòng (mục 2).
      </p>
      <p>
        Nói cho đủ: mã phòng mặc định được <em>cắt ra từ</em> <code>instance_id</code> của voice
        channel (6 ký tự cuối, viết hoa), nên mã phòng lưu trên máy chủ có nguồn gốc từ một định
        danh của Discord. Nó là định danh của <strong>phòng thoại</strong>, không phải của người
        chơi, và cũng biến mất cùng phòng sau 6 giờ.
      </p>

      <h2>4. Trẻ em</h2>
      <p>
        Game không chủ đích thu thập dữ liệu của trẻ em. Vì không có tài khoản, thứ duy nhất một
        người chơi nhập vào là tên hiển thị — hãy chọn một biệt danh, đừng dùng tên thật.
      </p>

      <h2>5. Quyền của bạn</h2>
      <p>
        Vì không có tài khoản, cách xoá dữ liệu là: rời phòng (xoá dữ liệu phía máy chủ) và xoá dữ
        liệu trang web trong trình duyệt (xoá dữ liệu phía máy bạn). Muốn chắc hơn nữa thì liên hệ
        người vận hành bản triển khai bạn đang chơi — mỗi bản là một máy chủ độc lập.
      </p>
    </>
  );
}
