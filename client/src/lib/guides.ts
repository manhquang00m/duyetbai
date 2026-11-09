import { Send, type LucideIcon } from 'lucide-react'

/*
 * Noi dung module Huong dan. Them bai moi = them 1 object vao GUIDES + dat anh vao
 * public/guide/<id>/. Text ho tro **dam** (render an toan, khong dung innerHTML).
 */
export interface GuideStep {
  title: string
  body: string
  image?: string
  /** Ghi chu nho duoi mo ta (checklist, luu y). */
  tips?: string[]
  /** Link nhanh toi trang trong app. */
  link?: { to: string; label: string }
}

export interface GuideSection {
  title: string
  description?: string
  steps: GuideStep[]
}

export interface Guide {
  id: string
  title: string
  summary: string
  icon: LucideIcon
  sections: GuideSection[]
}

const img = (lesson: string, file: string) => `/guide/${lesson}/${file}`

export const GUIDES: Guide[] = [
  {
    id: 'dang-bai',
    title: 'Đăng bài',
    summary: 'Phân phối bài trong app → tải file Excel → chạy upload_threads trên GPM để auto đăng.',
    icon: Send,
    sections: [
      {
        title: 'Chuẩn bị & phân phối bài',
        description: 'Tạo kế hoạch đăng trong app và xuất file Excel cho tool auto đăng.',
        steps: [
          {
            title: 'Khởi động Launcher',
            body: 'Mở **Thread Affiliate Launcher**, bấm **Start**. Chờ **Server :3000** và **Client :5173** chuyển xanh rồi bấm **Mở app**.',
            image: img('dang-bai', '01-launcher.png'),
          },
          {
            title: 'Phân phối bài',
            body: 'Vào **Vận hành › Phân phối bài**. Kiểm tra kho bài sạch, gán chủ đề cho tài khoản đăng rồi tạo kế hoạch.',
            image: img('dang-bai', '02-phan-phoi-bai.png'),
            tips: ['Bấm "Quy tắc chia bài" ở góc phải để xem cách app bốc bài.'],
            link: { to: '/distribution', label: 'Mở Phân phối bài' },
          },
          {
            title: 'Tải file từ kế hoạch đã tạo',
            body: 'Ở mục **Kế hoạch đã tạo**, bấm **Tải file** của kế hoạch cần đăng. File Excel `phan_phoi_<ngày>_….xlsx` sẽ được lưu vào thư mục Downloads.',
            image: img('dang-bai', '03-tai-file.png'),
          },
        ],
      },
      {
        title: 'Đăng bài với GPM',
        description: 'Dùng GPM Login + GPM Automate chạy script upload_threads với file vừa tải.',
        steps: [
          {
            title: 'Khởi động GPM Login Global',
            body: 'Mở ứng dụng **GPM Login Global**.',
            image: img('dang-bai', '04-gpm-login.png'),
          },
          {
            title: 'Chọn Automation',
            body: 'Ở sidebar bên trái, mục **Automation**, bấm **Automation** để mở GPM Automate.',
            image: img('dang-bai', '05-automation.png'),
          },
          {
            title: 'Chọn upload_threads',
            body: 'Trong danh sách **Recent Project**, chọn **upload_threads** (`C:\\Affiliate\\duyetbai\\gpm_script\\upload_threads`).',
            image: img('dang-bai', '06-chon-upload-threads.png'),
          },
          {
            title: 'Continue',
            body: 'Kiểm tra **upload_threads** đã nằm trong danh sách Selected (có dấu tích xanh) rồi bấm **Continue**.',
            image: img('dang-bai', '07-continue.png'),
          },
          {
            title: 'Chọn file phân phối bài rồi tiếp tục',
            body: 'Ở **Inputs › Use input Excel**, bấm **Browse…** và chọn file Excel vừa tải ở Phần 1. Sau đó bấm **Continue**.',
            image: img('dang-bai', '08-chon-file-excel.png'),
            tips: [
              'Tick "Use input Excel", Sheet Id = 0.',
              'Map mode: "Each profile reads one row".',
              'Tick "Map according to the profile name in column A".',
              'Tick "Write \'OK\' status to the Excel file upon completion", OK column = Z.',
            ],
          },
          {
            title: 'Chọn tất cả profile rồi Start',
            body: 'Chọn tất cả profile trong danh sách. Kiểm tra góc trên phải không còn **0 selected**, rồi bấm **Start**.',
            image: img('dang-bai', '09-chon-profile-start.png'),
          },
        ],
      },
    ],
  },
]

export function findGuide(id: string | undefined): Guide | undefined {
  return GUIDES.find((g) => g.id === id)
}
