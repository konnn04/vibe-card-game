import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Điều khoản sử dụng',
  description: 'Điều khoản sử dụng Ú Nồ — dự án mã nguồn mở, tự dựng máy chủ, chơi nội bộ.',
  alternates: { canonical: '/legal/terms' },
  robots: { index: true, follow: true },
};

const UPDATED = '13/09/2026';

export default function TermsPage() {
  return (
    <>
      <h1>Điều khoản sử dụng</h1>
      <p className="muted">Cập nhật {UPDATED}</p>

      <h2>1. Đây là cái gì</h2>
      <p>
        Ú Nồ là một dự án <strong>mã nguồn mở</strong>, phi thương mại, do người dùng tự dựng máy
        chủ (self-host) và chơi trong phạm vi nội bộ — nhóm bạn bè, một server Discord. Không có
        tài khoản, không thu phí, không quảng cáo, không vật phẩm trả tiền.
      </p>

      <h2>2. Bản quyền và nguồn tham khảo</h2>
      <p>
        Luật chơi trong game là các <strong>cơ chế bài chung</strong> (đánh theo màu/số, rút phạt,
        đảo chiều, bỏ lượt). Cơ chế trò chơi không thuộc phạm vi bảo hộ bản quyền. Dự án{' '}
        <strong>không liên kết, không được tài trợ hay chứng thực</strong> bởi bất kỳ nhà phát hành
        trò chơi nào, và không sử dụng tên thương hiệu, logo hay hình ảnh thương mại của họ.
      </p>
      <p>
        Hình ảnh lá bài, âm thanh và nhạc nền <strong>không đi kèm dự án</strong>: chúng do người
        dựng máy chủ tự đặt vào thư mục <code>public/</code>. Người dựng máy chủ chịu trách nhiệm
        bảo đảm mình có quyền sử dụng những tệp đó. Nếu bạn là chủ sở hữu một nội dung bị đặt nhầm
        vào một bản triển khai, hãy liên hệ người vận hành bản đó để gỡ.
      </p>

      <h2>3. Giấy phép phần mềm</h2>
      <p>
        Mã nguồn được cung cấp theo giấy phép kèm trong kho mã. Bạn được tự do dùng, sửa và phân
        phối lại theo đúng các điều khoản của giấy phép đó.
      </p>

      <h2>4. Không bảo hành</h2>
      <p>
        Phần mềm được cung cấp <strong>&ldquo;nguyên trạng&rdquo;</strong>, không kèm bất kỳ bảo
        hành nào. Ván đấu có thể mất, phòng có thể bị xoá, máy chủ có thể ngừng bất cứ lúc nào.
        Không ai chịu trách nhiệm cho thiệt hại phát sinh từ việc sử dụng phần mềm.
      </p>

      <h2>5. Cách cư xử</h2>
      <p>
        Đừng dùng tên hiển thị hay ảnh đại diện mang tính quấy rối, thù ghét hoặc khiêu dâm. Đừng
        cố khai thác lỗi để phá ván của người khác. Người vận hành mỗi bản triển khai có toàn quyền
        chặn hoặc xoá phòng.
      </p>

      <h2>6. Về phía Discord</h2>
      <p>
        Khi chạy dưới dạng Discord Activity, việc bạn sử dụng Discord còn chịu sự điều chỉnh của
        Điều khoản dịch vụ và Nguyên tắc cộng đồng của Discord. Dự án này không thay thế chúng.
      </p>

      <h2>7. Thay đổi</h2>
      <p>
        Điều khoản có thể được cập nhật cùng với mã nguồn. Bản đang hiển thị là bản có hiệu lực cho
        máy chủ bạn đang truy cập.
      </p>
    </>
  );
}
