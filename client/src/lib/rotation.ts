/**
 * XOAY VÒNG HÀNG CHỜ — ai nhường ghế cho ai ở ván sau.
 *
 * Luật nằm ở `@u-no/shared` (packages/shared/src/rotation.ts). Có ĐÚNG HAI nơi
 * cần câu trả lời và chúng bắt buộc phải khớp nhau:
 *  - server, lúc thật sự chia lại bài (NEXT_ROUND);
 *  - bảng điểm cuối ván, để hiện trước những người sẽ chơi ván tới.
 * Chép luật này ra hai chỗ thì sớm muộn màn hình hứa một đằng, server làm một
 * nẻo — nên ở đây chỉ re-export.
 */
export { fillFreeSeats, pickRotation, seatsAfterRotation, shrinkSeats } from '@u-no/shared';
export type { Rotation, RotationInput } from '@u-no/shared';
