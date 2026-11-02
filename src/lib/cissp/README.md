# Kho câu hỏi CISSP (damonsec.com/cissp)

Mọi câu hỏi nằm trong code, không có database. Thêm câu = thêm một object vào file TypeScript, chạy test, rồi
merge. Vercel tự deploy, và chế độ Test sẽ bốc ngẫu nhiên luôn cả câu mới.

## File nào chứa gì

| File | Nội dung | `level` |
| --- | --- | --- |
| `scenarios.ts` | 24 câu core đầu tiên, kiểu dữ liệu `Scenario`, và danh sách gộp `SCENARIOS` | không có |
| `scenarios-more.ts` | Câu core bổ sung | không có |
| `scenarios-hard.ts` | Câu khó: cả 4 phương án đều hợp lý, chữ hạn định quyết định | `'hard'` |
| `scenarios-expert.ts` | Câu expert: tình huống dài có nhiễu, LEAST/EXCEPT, trộn domain | `'expert'` |
| `domains.ts` | 8 domain và trọng số | |
| `trainer.ts` | Logic: lọc, bốc đề ngẫu nhiên (`drawTest`), chấm điểm (`gradeTest`) | |

Thêm câu core thì bỏ vào `scenarios-more.ts`, câu hard vào `scenarios-hard.ts`, câu expert vào
`scenarios-expert.ts`. Muốn tách file mới (ví dụ `scenarios-2027.ts`) thì export một mảng `Scenario[]` rồi thêm nó vào
dòng `export const SCENARIOS = [...]` cuối `scenarios.ts`.

## Mẫu một câu

```ts
{
  id: 'expert-vendor-breach-notice', // duy nhất, kebab-case, KHÔNG đổi sau khi đã đăng (link, comment, tiến độ gắn theo id)
  domainId: 'd1',                    // domain chính: d1 … d8
  alsoDomains: ['d7'],               // tùy chọn: domain phụ nếu câu trộn domain
  level: 'expert',                   // bỏ trống = core; 'hard' hoặc 'expert'
  title: { en: '…', vi: '…' },       // ẩn cho tới khi trả lời
  situation: { en: '…', vi: '…' },
  question: { en: 'What should you do FIRST?', vi: 'Bạn nên làm gì TRƯỚC TIÊN?' },
  options: [
    { id: 'A', text: { en: '…', vi: '…' }, why: { en: '…', vi: '…' } },
    { id: 'B', text: { en: '…', vi: '…' }, why: { en: 'Correct. …', vi: 'Đúng. …' } },
    { id: 'C', text: { en: '…', vi: '…' }, why: { en: '…', vi: '…' } },
    { id: 'D', text: { en: '…', vi: '…' }, why: { en: '…', vi: '…' } },
  ],
  answer: 'B',
  explanation: { en: '…', vi: '…' },
  takeaway: { en: 'One-line rule to remember.', vi: 'Một câu để nhớ.' },
  concepts: ['Due care', 'Incident response'],
},
```

Thứ tự A–D trong file không phải thứ tự hiển thị: trang tự xáo phương án theo `id`, nên cứ viết đáp án ở slot nào cũng
được.

## Checklist trước khi merge

- `npm test` pass. Test tự kiểm tra:
  - `id` không trùng;
  - đủ 4 phương án A–D, có cả EN và VI, bản VI không phải copy bản EN;
  - `why` của đáp án đúng bắt đầu bằng `Correct.` / `Đúng.`, phương án sai thì không;
  - mỗi domain có ít nhất 2 câu hard và 3 câu expert;
  - với câu expert: tình huống từ 300 ký tự, ít nhất nửa số câu trộn domain, và đáp án đúng không được hay là phương án dài nhất.
- Đáp án đúng không dài hơn hay "đầy đủ" hơn hẳn các phương án khác (người làm sẽ đoán theo độ dài).
- Chỉ dùng dữ kiện có trong đề. Số liệu (ALE, RTO…) tính lại một lần nữa.
- Tiếng Việt viết theo giọng dân IT, giữ thuật ngữ tiếng Anh (risk, control, incident…). Chữ hạn định viết hoa: TRƯỚC
  TIÊN, TỐT NHẤT, KÉM PHÙ HỢP NHẤT, NGOẠI TRỪ.
- Không chép nguyên văn câu hỏi từ sách hay đề thi. Tự viết tình huống.

## Quy trình

```bash
git checkout -b cissp/add-questions
# sửa file scenarios-*.ts
npm test
npm run build
git commit -am "CISSP: add N scenarios"
git push -u origin cissp/add-questions
```

Mở PR, chờ CI xanh, merge vào `main`. Vercel tự deploy production. Header trang, bộ lọc và chế độ Test tự cập nhật số
câu, không cần sửa chỗ nào khác.
