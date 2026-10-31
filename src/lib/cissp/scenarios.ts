// CISSP practice scenarios, written by DamonSec. Not ISC2 exam questions.
// Every scenario has four options, one answer, and a reason for each option in English and Vietnamese.

import type { Bi, DomainId } from './domains.ts';

export type OptionId = 'A' | 'B' | 'C' | 'D';

export interface ScenarioOption {
  id: OptionId;
  text: Bi;
  /** Why this option is right or wrong. */
  why: Bi;
}

export interface Scenario {
  id: string;
  domainId: DomainId;
  title: Bi;
  situation: Bi;
  question: Bi;
  options: ScenarioOption[];
  answer: OptionId;
  explanation: Bi;
  /** One-line rule to remember for similar exam questions. */
  takeaway: Bi;
  concepts: string[];
}

export const SCENARIOS: Scenario[] = [
  // ── Domain 1: Security and Risk Management ───────────────────────────────
  {
    id: 'new-ciso-first-step',
    domainId: 'd1',
    title: { en: 'A new CISO at a hospital', vi: 'CISO mới tại bệnh viện' },
    situation: {
      en: 'You have just joined a 600-bed hospital as its first CISO. There is no formal security program. The CIO wants you to "buy whatever we need", the board has asked for a plan within 90 days, and the network team has already sent you a list of 1,200 vulnerabilities from a recent scan.',
      vi: 'Bạn vừa gia nhập một bệnh viện 600 giường với vai trò CISO đầu tiên. Bệnh viện chưa có chương trình bảo mật chính thức. CIO bảo bạn "cần mua gì thì cứ mua", hội đồng quản trị yêu cầu một kế hoạch trong 90 ngày, và team network đã gửi bạn danh sách 1.200 lỗ hổng từ đợt scan gần nhất.',
    },
    question: { en: 'What should you do FIRST?', vi: 'Bạn nên làm gì ĐẦU TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Start patching the critical vulnerabilities from the scan.', vi: 'Bắt đầu vá các lỗ hổng critical trong kết quả scan.' },
        why: {
          en: 'Patching is a technical, tactical task. Without knowing which systems matter most to patient care, you cannot even prioritise the 1,200 findings correctly.',
          vi: 'Vá lỗi là công việc kỹ thuật, mang tính chiến thuật. Khi chưa biết hệ thống nào quan trọng nhất với việc chăm sóc bệnh nhân, bạn không thể ưu tiên đúng 1.200 phát hiện này.',
        },
      },
      {
        id: 'B',
        text: { en: 'Write an information security policy and publish it to all staff.', vi: 'Viết chính sách an toàn thông tin và ban hành cho toàn bộ nhân viên.' },
        why: {
          en: 'Policy is needed, but a policy written before you understand the business and have management backing will not reflect the organisation\'s goals and will not be enforced.',
          vi: 'Chính sách là cần thiết, nhưng nếu viết trước khi hiểu hoạt động kinh doanh và chưa có sự ủng hộ của lãnh đạo thì nó sẽ không phản ánh mục tiêu của tổ chức và sẽ không được thực thi.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Meet senior management to understand business objectives and risk appetite, and get their sponsorship for the program.',
          vi: 'Gặp lãnh đạo cấp cao để hiểu mục tiêu kinh doanh, khẩu vị rủi ro (risk appetite) và nhận được sự bảo trợ cho chương trình.',
        },
        why: {
          en: 'Correct. A security program exists to support the business. Senior management support and an understanding of objectives and risk appetite come before risk assessment, policy or tools.',
          vi: 'Đúng. Chương trình bảo mật tồn tại để hỗ trợ hoạt động kinh doanh. Sự ủng hộ của lãnh đạo cấp cao và hiểu biết về mục tiêu, khẩu vị rủi ro phải có trước khi đánh giá rủi ro, viết chính sách hay mua công cụ.',
        },
      },
      {
        id: 'D',
        text: { en: 'Buy a SIEM so you can see what is happening on the network.', vi: 'Mua một hệ thống SIEM để quan sát những gì đang diễn ra trên mạng.' },
        why: {
          en: 'Buying technology before defining requirements is a classic wrong answer. A SIEM with no use cases, owners or staff produces noise, not security.',
          vi: 'Mua công nghệ trước khi xác định yêu cầu là một đáp án sai kinh điển. SIEM không có use case, không có người chịu trách nhiệm và nhân sự vận hành thì chỉ tạo ra nhiễu, không tạo ra bảo mật.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'CISSP questions reward the manager\'s view. Governance starts top-down: align security with business goals, get senior management to own the program, then assess risk, then write policy, then choose controls. Every other option here is a valid activity, just not the first one.',
      vi: 'Câu hỏi CISSP ưu tiên góc nhìn của nhà quản lý. Quản trị (governance) bắt đầu từ trên xuống: gắn bảo mật với mục tiêu kinh doanh, để lãnh đạo cấp cao làm chủ chương trình, sau đó đánh giá rủi ro, rồi viết chính sách, rồi mới chọn biện pháp kiểm soát. Các lựa chọn khác đều là việc hợp lệ, chỉ là không phải việc đầu tiên.',
    },
    takeaway: {
      en: 'When asked what to do FIRST in a new program: business alignment and senior management support.',
      vi: 'Khi được hỏi làm gì ĐẦU TIÊN trong một chương trình mới: gắn với mục tiêu kinh doanh và có sự ủng hộ của lãnh đạo cấp cao.',
    },
    concepts: ['governance', 'senior management', 'risk appetite'],
  },
  {
    id: 'ale-cost-justification',
    domainId: 'd1',
    title: { en: 'Is the flood control worth it?', vi: 'Có đáng đầu tư biện pháp chống lũ?' },
    situation: {
      en: 'A server room is valued at $500,000. A flood would damage about 40% of it. Flood records show one flood every 10 years in the area. A vendor offers flood barriers and sensors that cost $25,000 per year and would almost eliminate the risk.',
      vi: 'Một phòng máy chủ có giá trị $500.000. Một trận lũ sẽ làm hư hại khoảng 40% giá trị. Số liệu cho thấy khu vực này có lũ khoảng 10 năm một lần. Một nhà cung cấp chào giải pháp tấm chắn và cảm biến chống lũ với chi phí $25.000 mỗi năm, gần như loại bỏ hoàn toàn rủi ro.',
    },
    question: {
      en: 'Based only on quantitative analysis, what should you recommend?',
      vi: 'Chỉ dựa trên phân tích định lượng, bạn nên đề xuất gì?',
    },
    options: [
      {
        id: 'A',
        text: { en: 'Buy it. The ALE is $200,000, far above the control cost.', vi: 'Mua. ALE là $200.000, cao hơn nhiều so với chi phí biện pháp.' },
        why: {
          en: '$200,000 is the SLE (500,000 × 0.4). It ignores the ARO of 0.1, so it overstates the yearly loss tenfold.',
          vi: '$200.000 là SLE (500.000 × 0.4). Con số này bỏ qua ARO = 0,1 nên phóng đại tổn thất hằng năm lên gấp mười lần.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Do not buy it on cost grounds. The ALE is $20,000, so the control costs more than the loss it prevents.',
          vi: 'Không mua xét về chi phí. ALE là $20.000, nên biện pháp này tốn nhiều hơn tổn thất mà nó ngăn được.',
        },
        why: {
          en: 'Correct. SLE = AV × EF = $500,000 × 0.4 = $200,000. ALE = SLE × ARO = $200,000 × 0.1 = $20,000. Even if the control removed all of the risk, the yearly benefit ($20,000) is less than its yearly cost ($25,000).',
          vi: 'Đúng. SLE = AV × EF = $500.000 × 0,4 = $200.000. ALE = SLE × ARO = $200.000 × 0,1 = $20.000. Kể cả khi biện pháp loại bỏ toàn bộ rủi ro, lợi ích mỗi năm ($20.000) vẫn nhỏ hơn chi phí mỗi năm ($25.000).',
        },
      },
      {
        id: 'C',
        text: { en: 'Buy it. Any control that reduces risk should be implemented.', vi: 'Mua. Biện pháp nào giảm được rủi ro cũng nên triển khai.' },
        why: {
          en: 'Controls must be cost-justified. Spending more than the value protected is not due care, it is waste.',
          vi: 'Biện pháp kiểm soát phải hợp lý về chi phí. Chi nhiều hơn giá trị được bảo vệ không phải là due care mà là lãng phí.',
        },
      },
      {
        id: 'D',
        text: { en: 'Do not buy it. The ARO is too low for floods to matter.', vi: 'Không mua. ARO quá thấp nên lũ không đáng quan tâm.' },
        why: {
          en: 'The conclusion happens to match, but the reasoning is wrong. A low ARO does not make a risk irrelevant; the decision comes from comparing ALE with the control cost.',
          vi: 'Kết luận trùng nhưng lập luận sai. ARO thấp không có nghĩa rủi ro không quan trọng; quyết định đến từ việc so sánh ALE với chi phí biện pháp.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Know the chain: Asset Value × Exposure Factor = Single Loss Expectancy; SLE × Annualized Rate of Occurrence = Annualized Loss Expectancy. Value of a safeguard = (ALE before − ALE after) − annual cost of the safeguard. Here: (20,000 − ~0) − 25,000 = −5,000, so it is not cost-justified. In practice you might still accept, transfer (insurance) or find a cheaper control. Exception to remember: when human safety is involved, cost is not the deciding factor.',
      vi: 'Cần nhớ chuỗi công thức: Giá trị tài sản (AV) × Hệ số phơi nhiễm (EF) = SLE; SLE × Tần suất xảy ra hằng năm (ARO) = ALE. Giá trị của một biện pháp = (ALE trước − ALE sau) − chi phí hằng năm của biện pháp. Ở đây: (20.000 − ~0) − 25.000 = −5.000, nên không hợp lý về chi phí. Thực tế bạn có thể chấp nhận rủi ro, chuyển giao (mua bảo hiểm) hoặc tìm biện pháp rẻ hơn. Ngoại lệ cần nhớ: khi liên quan đến an toàn tính mạng con người, chi phí không phải yếu tố quyết định.',
    },
    takeaway: {
      en: 'SLE = AV × EF. ALE = SLE × ARO. A control is justified only if the ALE reduction exceeds its annual cost.',
      vi: 'SLE = AV × EF. ALE = SLE × ARO. Biện pháp chỉ hợp lý khi mức giảm ALE lớn hơn chi phí hằng năm của nó.',
    },
    concepts: ['quantitative risk analysis', 'SLE', 'ALE', 'ARO'],
  },
  {
    id: 'ethics-exam-content',
    domainId: 'd1',
    title: { en: 'A friend asks about your exam', vi: 'Bạn bè hỏi về đề thi' },
    situation: {
      en: 'You passed the CISSP last month. A close friend who is booked for the exam next week messages you: "Can you send me the questions you remember? Just the hard ones. Nobody will know."',
      vi: 'Bạn vừa đậu CISSP tháng trước. Một người bạn thân đã đăng ký thi tuần sau nhắn: "Gửi mình mấy câu hỏi bạn còn nhớ được không? Chỉ mấy câu khó thôi. Không ai biết đâu."',
    },
    question: { en: 'What is the BEST response?', vi: 'Cách phản hồi TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Share the questions paraphrased in your own words.', vi: 'Chia sẻ các câu hỏi nhưng diễn đạt lại theo cách của bạn.' },
        why: {
          en: 'Paraphrasing is still disclosing exam content. The candidate agreement covers the substance of questions, not just the exact wording.',
          vi: 'Diễn đạt lại vẫn là tiết lộ nội dung đề thi. Thỏa thuận thí sinh bao gồm cả nội dung câu hỏi, không chỉ câu chữ chính xác.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Decline, explain that exam content is covered by the non-disclosure agreement and the Code of Ethics, and point them to the official exam outline.',
          vi: 'Từ chối, giải thích rằng nội dung đề thi được bảo vệ bởi thỏa thuận bảo mật (NDA) và Bộ quy tắc đạo đức, và giới thiệu bạn ấy xem exam outline chính thức.',
        },
        why: {
          en: 'Correct. Disclosing exam content breaks the NDA you accepted and the canons to act honorably, honestly, justly, responsibly and legally, and to advance and protect the profession. The outline is public and fair to share.',
          vi: 'Đúng. Tiết lộ nội dung đề vi phạm NDA bạn đã chấp nhận và các nguyên tắc: hành xử danh dự, trung thực, công bằng, có trách nhiệm và hợp pháp; thúc đẩy và bảo vệ nghề nghiệp. Exam outline là tài liệu công khai nên chia sẻ được.',
        },
      },
      {
        id: 'C',
        text: { en: 'Share them, because your friend is also an ISC2 candidate.', vi: 'Chia sẻ, vì bạn ấy cũng là thí sinh của ISC2.' },
        why: {
          en: 'Being a candidate does not give anyone a right to exam content. This helps one person and damages the value of the credential for everyone.',
          vi: 'Là thí sinh không cho ai quyền xem nội dung đề. Việc này giúp một người nhưng làm giảm giá trị chứng chỉ của tất cả mọi người.',
        },
      },
      {
        id: 'D',
        text: { en: 'Post the questions anonymously on a forum so you are not personally involved.', vi: 'Đăng ẩn danh các câu hỏi lên diễn đàn để bạn không bị liên quan trực tiếp.' },
        why: {
          en: 'Anonymity changes the chance of being caught, not whether it is a breach. It also spreads the damage further.',
          vi: 'Ẩn danh chỉ thay đổi khả năng bị phát hiện, không thay đổi việc đó là vi phạm. Nó còn lan rộng thiệt hại hơn.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'The ISC2 Code of Ethics has four canons, applied in this order: (1) protect society, the common good, necessary public trust and confidence, and the infrastructure; (2) act honorably, honestly, justly, responsibly and legally; (3) provide diligent and competent service to principals; (4) advance and protect the profession. Exam-dump questions test canons 2 and 4. Members who knowingly help others break the code can lose their certification.',
      vi: 'Bộ quy tắc đạo đức ISC2 có bốn nguyên tắc, áp dụng theo thứ tự: (1) bảo vệ xã hội, lợi ích chung, niềm tin của công chúng và hạ tầng; (2) hành xử danh dự, trung thực, công bằng, có trách nhiệm và hợp pháp; (3) phục vụ tận tâm và có năng lực cho bên sử dụng dịch vụ; (4) thúc đẩy và bảo vệ nghề nghiệp. Tình huống "xin đề" kiểm tra nguyên tắc 2 và 4. Thành viên cố ý giúp người khác vi phạm có thể bị thu hồi chứng chỉ.',
    },
    takeaway: {
      en: 'Know the four canons and their order. Society first, profession last.',
      vi: 'Nhớ bốn nguyên tắc và thứ tự của chúng. Xã hội đứng đầu, nghề nghiệp đứng cuối.',
    },
    concepts: ['ISC2 Code of Ethics', 'NDA'],
  },

  // ── Domain 2: Asset Security ─────────────────────────────────────────────
  {
    id: 'who-classifies-data',
    domainId: 'd2',
    title: { en: 'Who sets the classification?', vi: 'Ai quyết định phân loại dữ liệu?' },
    situation: {
      en: 'The sales department is launching a new CRM that stores customer contacts, contract values and pricing discounts. The DBA who is building the database asks you, the security manager, which classification label to apply so they can configure encryption and access.',
      vi: 'Phòng kinh doanh đang triển khai hệ thống CRM mới lưu thông tin liên hệ khách hàng, giá trị hợp đồng và mức chiết khấu. DBA đang dựng database hỏi bạn, người quản lý bảo mật, nên gắn nhãn phân loại nào để cấu hình mã hóa và phân quyền.',
    },
    question: { en: 'Who should decide the classification?', vi: 'Ai nên quyết định mức phân loại?' },
    options: [
      {
        id: 'A',
        text: { en: 'The DBA, because they manage the data every day.', vi: 'DBA, vì họ quản lý dữ liệu hằng ngày.' },
        why: {
          en: 'The DBA is the data custodian: they implement and maintain the protection that someone else decides on.',
          vi: 'DBA là data custodian (người giám hộ dữ liệu): họ triển khai và duy trì các biện pháp bảo vệ do người khác quyết định.',
        },
      },
      {
        id: 'B',
        text: { en: 'You, the security manager.', vi: 'Bạn, người quản lý bảo mật.' },
        why: {
          en: 'Security defines the classification scheme and advises, but does not own business data. Taking the decision moves accountability to the wrong place.',
          vi: 'Bộ phận bảo mật xây dựng khung phân loại và tư vấn, nhưng không sở hữu dữ liệu nghiệp vụ. Tự quyết định sẽ đặt trách nhiệm giải trình sai chỗ.',
        },
      },
      {
        id: 'C',
        text: { en: 'The head of sales, as the data owner.', vi: 'Trưởng phòng kinh doanh, với vai trò data owner (chủ sở hữu dữ liệu).' },
        why: {
          en: 'Correct. The data owner is a senior business manager who is accountable for the data, decides its classification and approves who gets access.',
          vi: 'Đúng. Data owner là quản lý cấp cao phía nghiệp vụ, chịu trách nhiệm giải trình về dữ liệu, quyết định mức phân loại và phê duyệt ai được truy cập.',
        },
      },
      {
        id: 'D',
        text: { en: 'The CRM vendor, based on their default settings.', vi: 'Nhà cung cấp CRM, dựa trên cấu hình mặc định của họ.' },
        why: {
          en: 'A vendor does not know the value of your data to your business and carries none of the accountability.',
          vi: 'Nhà cung cấp không biết giá trị dữ liệu đối với doanh nghiệp của bạn và không chịu trách nhiệm giải trình nào.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Separate the roles: the data owner (business, accountable) classifies and approves access; the data custodian (IT/DBA) implements controls such as backups and encryption; the security team writes the scheme and advises; users follow the rules. On the exam, "accountable" points to the owner and "day-to-day protection" points to the custodian.',
      vi: 'Phân biệt các vai trò: data owner (nghiệp vụ, chịu trách nhiệm giải trình) phân loại và phê duyệt quyền truy cập; data custodian (IT/DBA) triển khai biện pháp như backup, mã hóa; team bảo mật xây dựng khung phân loại và tư vấn; người dùng tuân thủ quy định. Trong đề thi, từ "accountable" chỉ owner, còn "bảo vệ hằng ngày" chỉ custodian.',
    },
    takeaway: {
      en: 'Owner classifies and is accountable. Custodian implements.',
      vi: 'Owner phân loại và chịu trách nhiệm giải trình. Custodian triển khai.',
    },
    concepts: ['data owner', 'data custodian', 'classification'],
  },
  {
    id: 'ssd-sanitization',
    domainId: 'd2',
    title: { en: 'Donating old SSD laptops', vi: 'Tặng laptop SSD cũ' },
    situation: {
      en: 'Your company wants to donate 200 retired laptops to a local school. The laptops have self-encrypting SSDs that held confidential HR and finance files. Management wants the drives to stay in the laptops so they are usable.',
      vi: 'Công ty muốn tặng 200 laptop đã thanh lý cho một trường học địa phương. Các laptop dùng SSD tự mã hóa (self-encrypting) từng chứa dữ liệu mật về nhân sự và tài chính. Ban lãnh đạo muốn giữ nguyên ổ đĩa trong máy để trường còn dùng được.',
    },
    question: { en: 'Which method is MOST appropriate?', vi: 'Phương pháp nào PHÙ HỢP NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Degauss each drive.', vi: 'Khử từ (degauss) từng ổ đĩa.' },
        why: {
          en: 'Degaussing works on magnetic media. SSDs store data in flash cells, so a degausser does not reliably erase them, and it may destroy the drive anyway.',
          vi: 'Khử từ chỉ hiệu quả với phương tiện từ tính. SSD lưu dữ liệu trong ô nhớ flash nên degauss không xóa được một cách tin cậy, mà còn có thể làm hỏng ổ.',
        },
      },
      {
        id: 'B',
        text: { en: 'Overwrite every sector three times with zeros.', vi: 'Ghi đè mọi sector ba lần bằng số 0.' },
        why: {
          en: 'Wear levelling and over-provisioning mean the OS cannot address every flash cell, so overwriting can leave old data behind.',
          vi: 'Cơ chế wear levelling và over-provisioning khiến hệ điều hành không thể truy cập mọi ô flash, nên ghi đè có thể còn sót dữ liệu cũ.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Purge with cryptographic erase (destroy the drive\'s media encryption key), then verify and document it.',
          vi: 'Purge bằng cryptographic erase (hủy khóa mã hóa của ổ đĩa), sau đó kiểm tra và ghi nhận lại.',
        },
        why: {
          en: 'Correct. On a self-encrypting drive, destroying the media encryption key makes all stored data unreadable while leaving the drive reusable. NIST SP 800-88 lists cryptographic erase as a purge method. Verification and records prove it was done.',
          vi: 'Đúng. Với ổ tự mã hóa, hủy khóa mã hóa khiến toàn bộ dữ liệu không thể đọc được, trong khi ổ vẫn tái sử dụng được. NIST SP 800-88 xếp cryptographic erase vào nhóm purge. Kiểm tra và lưu hồ sơ để chứng minh đã thực hiện.',
        },
      },
      {
        id: 'D',
        text: { en: 'Delete the partitions and reinstall the OS.', vi: 'Xóa các phân vùng và cài lại hệ điều hành.' },
        why: {
          en: 'Deleting and formatting only remove pointers. Recovery tools can bring most of the data back. This is not even "clear" level sanitization.',
          vi: 'Xóa và format chỉ xóa con trỏ. Công cụ khôi phục có thể lấy lại phần lớn dữ liệu. Đây thậm chí chưa đạt mức "clear".',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'NIST SP 800-88 defines three levels: Clear (logical overwrite, protects against simple recovery), Purge (protects against lab recovery: cryptographic erase, block erase, degauss for magnetic media), and Destroy (shred, pulverise, incinerate). The data is confidential and the media leaves your control, so you need at least Purge. Because the drives must stay usable, Destroy is out, and cryptographic erase fits SSDs.',
      vi: 'NIST SP 800-88 định nghĩa ba mức: Clear (ghi đè logic, chống khôi phục đơn giản), Purge (chống khôi phục trong phòng lab: cryptographic erase, block erase, degauss cho phương tiện từ) và Destroy (cắt vụn, nghiền, đốt). Dữ liệu là mật và phương tiện sẽ rời khỏi tổ chức, nên cần ít nhất mức Purge. Vì ổ phải dùng lại được, Destroy bị loại, và cryptographic erase phù hợp với SSD.',
    },
    takeaway: {
      en: 'SSD + reuse → purge via cryptographic or vendor secure erase. Degaussing is for magnetic media only.',
      vi: 'SSD + tái sử dụng → purge bằng cryptographic erase hoặc secure erase của nhà sản xuất. Degauss chỉ dành cho phương tiện từ.',
    },
    concepts: ['data remanence', 'NIST SP 800-88', 'crypto erase'],
  },
  {
    id: 'legal-hold-vs-retention',
    domainId: 'd2',
    title: { en: 'Retention schedule meets a lawsuit', vi: 'Lịch xóa dữ liệu gặp vụ kiện' },
    situation: {
      en: 'Your retention policy says email older than two years is deleted automatically every Sunday. On Thursday, legal counsel tells you the company is being sued by a former supplier and issues a litigation hold on all communication with that supplier since 2021.',
      vi: 'Chính sách lưu trữ quy định email cũ hơn hai năm sẽ tự động bị xóa vào mỗi Chủ nhật. Thứ Năm, bộ phận pháp chế báo công ty đang bị một nhà cung cấp cũ kiện và ban hành lệnh lưu giữ (litigation hold) với mọi trao đổi với nhà cung cấp này từ năm 2021.',
    },
    question: { en: 'What should you do?', vi: 'Bạn nên làm gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Let Sunday\'s job run. The retention policy was approved by management.', vi: 'Để job Chủ nhật chạy bình thường. Chính sách lưu trữ đã được lãnh đạo phê duyệt.' },
        why: {
          en: 'Once litigation is expected, destroying relevant records is spoliation of evidence, even under an approved schedule. Courts can sanction the company.',
          vi: 'Khi đã biết có kiện tụng, việc hủy hồ sơ liên quan là hủy hoại chứng cứ (spoliation), dù theo lịch đã phê duyệt. Tòa án có thể xử phạt công ty.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Suspend deletion for the records covered by the hold, preserve them, and confirm with legal when the hold is lifted.',
          vi: 'Tạm dừng xóa với các hồ sơ thuộc phạm vi lệnh lưu giữ, bảo quản chúng và xác nhận với pháp chế khi nào lệnh được gỡ bỏ.',
        },
        why: {
          en: 'Correct. A legal hold overrides normal retention for the data in scope. Preserve it, keep the rest of the schedule running, and resume deletion only when legal releases the hold.',
          vi: 'Đúng. Lệnh lưu giữ pháp lý được ưu tiên hơn lịch lưu trữ thông thường với dữ liệu trong phạm vi. Bảo quản dữ liệu đó, phần còn lại vẫn xóa theo lịch, và chỉ xóa tiếp khi pháp chế gỡ lệnh.',
        },
      },
      {
        id: 'C',
        text: { en: 'Stop all deletion across the company indefinitely.', vi: 'Dừng toàn bộ việc xóa dữ liệu của công ty vô thời hạn.' },
        why: {
          en: 'Over-preserving increases storage cost, privacy exposure and discovery burden. The hold has a defined scope.',
          vi: 'Lưu giữ quá mức làm tăng chi phí lưu trữ, rủi ro quyền riêng tư và gánh nặng khi cung cấp chứng cứ. Lệnh lưu giữ có phạm vi xác định.',
        },
      },
      {
        id: 'D',
        text: { en: 'Export the supplier emails to your own laptop as a backup.', vi: 'Xuất email liên quan đến nhà cung cấp về laptop cá nhân để sao lưu.' },
        why: {
          en: 'Copying evidence to an uncontrolled device breaks integrity and chain of custody and creates a new data-protection risk.',
          vi: 'Sao chép chứng cứ sang thiết bị không được kiểm soát phá vỡ tính toàn vẹn, chuỗi lưu giữ chứng cứ (chain of custody) và tạo thêm rủi ro bảo vệ dữ liệu.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Retention policies define how long data is kept and when it is destroyed, but legal obligations come first. A litigation hold suspends destruction only for the relevant data until legal counsel releases it. Security\'s job is to make the hold technically effective and keep the data\'s integrity.',
      vi: 'Chính sách lưu trữ xác định dữ liệu được giữ bao lâu và khi nào hủy, nhưng nghĩa vụ pháp lý luôn được ưu tiên. Litigation hold tạm dừng việc hủy chỉ với dữ liệu liên quan, cho đến khi pháp chế gỡ lệnh. Nhiệm vụ của bảo mật là thực thi lệnh này về mặt kỹ thuật và giữ tính toàn vẹn của dữ liệu.',
    },
    takeaway: {
      en: 'Legal hold beats retention schedule, for the data in scope only.',
      vi: 'Legal hold được ưu tiên hơn lịch lưu trữ, nhưng chỉ với dữ liệu trong phạm vi.',
    },
    concepts: ['data retention', 'legal hold', 'e-discovery'],
  },

  // ── Domain 3: Security Architecture and Engineering ──────────────────────
  {
    id: 'bell-lapadula-write-down',
    domainId: 'd3',
    title: { en: 'Blocked from saving a report', vi: 'Bị chặn khi lưu báo cáo' },
    situation: {
      en: 'An analyst with a Secret clearance is logged in at the Secret level. She tries to save a summary report to a share labelled Unclassified so a wider team can read it. The trusted operating system blocks the save, although she can still read Unclassified files.',
      vi: 'Một chuyên viên phân tích có mức cleared Secret đang đăng nhập ở mức Secret. Chị ấy cố lưu một báo cáo tóm tắt vào thư mục chia sẻ gắn nhãn Unclassified để nhiều người đọc được. Hệ điều hành tin cậy chặn thao tác lưu, dù chị ấy vẫn đọc được các file Unclassified.',
    },
    question: { en: 'Which rule is the system enforcing?', vi: 'Hệ thống đang thực thi quy tắc nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Biba integrity star property (no write up).', vi: 'Biba integrity star property (không ghi lên - no write up).' },
        why: {
          en: 'Biba protects integrity and would block writing to a HIGHER integrity level, not a lower one.',
          vi: 'Biba bảo vệ tính toàn vẹn và chặn việc ghi lên mức toàn vẹn CAO HƠN, không phải mức thấp hơn.',
        },
      },
      {
        id: 'B',
        text: { en: 'Bell-LaPadula star (*) property (no write down).', vi: 'Bell-LaPadula star (*) property (không ghi xuống - no write down).' },
        why: {
          en: 'Correct. Bell-LaPadula protects confidentiality. The * property stops a subject from writing to a lower classification, which could leak Secret data to Unclassified readers.',
          vi: 'Đúng. Bell-LaPadula bảo vệ tính bí mật. Thuộc tính * ngăn chủ thể ghi xuống mức phân loại thấp hơn, vì như vậy có thể làm lộ dữ liệu Secret cho người đọc Unclassified.',
        },
      },
      {
        id: 'C',
        text: { en: 'Bell-LaPadula simple security property (no read up).', vi: 'Bell-LaPadula simple security property (không đọc lên - no read up).' },
        why: {
          en: 'Right model, wrong rule. The simple property controls reading higher levels; here the action is writing to a lower one.',
          vi: 'Đúng mô hình nhưng sai quy tắc. Simple property kiểm soát việc đọc mức cao hơn; ở đây hành động là ghi xuống mức thấp hơn.',
        },
      },
      {
        id: 'D',
        text: { en: 'Brewer-Nash (Chinese Wall).', vi: 'Brewer-Nash (Chinese Wall).' },
        why: {
          en: 'Brewer-Nash prevents conflicts of interest by blocking access to a competitor\'s data after you have accessed a client\'s. It does not use classification levels.',
          vi: 'Brewer-Nash ngăn xung đột lợi ích bằng cách chặn truy cập dữ liệu của đối thủ sau khi bạn đã truy cập dữ liệu của một khách hàng. Mô hình này không dùng mức phân loại.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Bell-LaPadula (confidentiality): no read up (simple security), no write down (* property), and the strong star property (read and write only at your own level). Biba (integrity) is the mirror: no read down, no write up. Memory aid: "BLP keeps secrets in, Biba keeps dirt out."',
      vi: 'Bell-LaPadula (bí mật): không đọc lên (simple security), không ghi xuống (thuộc tính *), và strong star property (chỉ đọc và ghi ở đúng mức của mình). Biba (toàn vẹn) là hình ảnh đối xứng: không đọc xuống, không ghi lên. Mẹo nhớ: "BLP giữ bí mật ở trong, Biba giữ dữ liệu bẩn ở ngoài."',
    },
    takeaway: {
      en: 'BLP = confidentiality: no read up, no write down. Biba = integrity: no read down, no write up.',
      vi: 'BLP = bí mật: không đọc lên, không ghi xuống. Biba = toàn vẹn: không đọc xuống, không ghi lên.',
    },
    concepts: ['Bell-LaPadula', 'Biba', 'MAC'],
  },
  {
    id: 'hybrid-crypto-sign-encrypt',
    domainId: 'd3',
    title: { en: 'Sending a 4 GB contract securely', vi: 'Gửi hợp đồng 4 GB an toàn' },
    situation: {
      en: 'Legal needs to send a 4 GB set of contract scans to an external law firm over the internet. The law firm must be sure the files came from your company and were not altered, and nobody else should be able to read them. Both sides have public/private key pairs.',
      vi: 'Bộ phận pháp chế cần gửi bộ scan hợp đồng 4 GB cho một công ty luật bên ngoài qua internet. Công ty luật cần chắc chắn file đến từ công ty bạn và không bị sửa đổi, và không ai khác đọc được. Cả hai bên đều có cặp khóa công khai/bí mật.',
    },
    question: { en: 'Which approach meets all the requirements MOST efficiently?', vi: 'Cách nào đáp ứng mọi yêu cầu HIỆU QUẢ NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Encrypt the files with your company\'s private key.', vi: 'Mã hóa file bằng khóa bí mật của công ty bạn.' },
        why: {
          en: 'Anyone with your public key, which is public, can decrypt it. This proves origin but gives no confidentiality.',
          vi: 'Bất kỳ ai có khóa công khai của bạn (vốn công khai) đều giải mã được. Cách này chứng minh nguồn gốc nhưng không bảo mật nội dung.',
        },
      },
      {
        id: 'B',
        text: { en: 'Encrypt the whole 4 GB directly with the law firm\'s public key.', vi: 'Mã hóa toàn bộ 4 GB trực tiếp bằng khóa công khai của công ty luật.' },
        why: {
          en: 'Gives confidentiality only, with no proof of origin or integrity, and asymmetric encryption of bulk data is very slow.',
          vi: 'Chỉ đảm bảo bí mật, không chứng minh nguồn gốc hay toàn vẹn, và mã hóa bất đối xứng dữ liệu lớn rất chậm.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Sign a hash of the files with your private key, encrypt the files with a random AES session key, and encrypt that key with the law firm\'s public key.',
          vi: 'Ký lên giá trị hash của file bằng khóa bí mật của bạn, mã hóa file bằng một khóa phiên AES ngẫu nhiên, và mã hóa khóa phiên đó bằng khóa công khai của công ty luật.',
        },
        why: {
          en: 'Correct. The digital signature gives integrity, authenticity and non-repudiation; symmetric AES handles bulk data fast; the recipient\'s public key protects the session key so only they can open it.',
          vi: 'Đúng. Chữ ký số đảm bảo toàn vẹn, xác thực và chống chối bỏ; AES đối xứng xử lý dữ liệu lớn nhanh; khóa công khai của bên nhận bảo vệ khóa phiên để chỉ họ mở được.',
        },
      },
      {
        id: 'D',
        text: { en: 'Send the files with a SHA-256 hash in the same email.', vi: 'Gửi file kèm giá trị hash SHA-256 trong cùng email.' },
        why: {
          en: 'An attacker who changes the files can also replace the hash. A bare hash gives no confidentiality and no authenticity.',
          vi: 'Kẻ tấn công sửa file thì cũng thay được hash. Hash đơn thuần không đảm bảo bí mật, cũng không đảm bảo xác thực.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Match each goal to a key: confidentiality → encrypt with the RECIPIENT\'s public key (or a session key protected by it); authenticity and non-repudiation → sign with the SENDER\'s private key; integrity → hash, protected by the signature. Real systems (TLS, PGP, S/MIME) are hybrid: asymmetric for key exchange and signatures, symmetric for bulk data.',
      vi: 'Gắn mỗi mục tiêu với một khóa: bí mật → mã hóa bằng khóa công khai của NGƯỜI NHẬN (hoặc khóa phiên được bảo vệ bởi nó); xác thực và chống chối bỏ → ký bằng khóa bí mật của NGƯỜI GỬI; toàn vẹn → hash, được bảo vệ bởi chữ ký. Hệ thống thực tế (TLS, PGP, S/MIME) đều là hybrid: bất đối xứng cho trao đổi khóa và chữ ký, đối xứng cho dữ liệu lớn.',
    },
    takeaway: {
      en: 'Confidentiality: recipient\'s public key. Non-repudiation: sender\'s private key. Bulk data: symmetric.',
      vi: 'Bí mật: khóa công khai người nhận. Chống chối bỏ: khóa bí mật người gửi. Dữ liệu lớn: đối xứng.',
    },
    concepts: ['hybrid cryptography', 'digital signature', 'non-repudiation'],
  },
  {
    id: 'fail-safe-door',
    domainId: 'd3',
    title: { en: 'The server room door in a fire', vi: 'Cửa phòng máy chủ khi có cháy' },
    situation: {
      en: 'You are designing access control for a new server room. The door uses an electromagnetic lock and a badge reader. The facilities manager asks how the door should behave if the fire alarm triggers and building power fails while two engineers are inside.',
      vi: 'Bạn đang thiết kế kiểm soát ra vào cho phòng máy chủ mới. Cửa dùng khóa điện từ và đầu đọc thẻ. Quản lý tòa nhà hỏi cửa nên hoạt động thế nào nếu chuông báo cháy kích hoạt và mất điện trong khi có hai kỹ sư đang ở bên trong.',
    },
    question: { en: 'How should the door be configured?', vi: 'Cửa nên được cấu hình như thế nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Fail-secure: stay locked to protect the equipment.', vi: 'Fail-secure: giữ khóa để bảo vệ thiết bị.' },
        why: {
          en: 'This can trap people inside during a fire. Protecting assets never outranks protecting people.',
          vi: 'Cách này có thể nhốt người bên trong khi cháy. Bảo vệ tài sản không bao giờ được ưu tiên hơn bảo vệ con người.',
        },
      },
      {
        id: 'B',
        text: { en: 'Fail-safe: unlock so people can get out, with alarms and CCTV to detect misuse.', vi: 'Fail-safe: mở khóa để người bên trong thoát ra được, kèm cảnh báo và CCTV để phát hiện lạm dụng.' },
        why: {
          en: 'Correct. Human safety is always the first priority. Compensating controls such as door alarms, cameras and a guard response cover the asset risk during the event.',
          vi: 'Đúng. An toàn con người luôn là ưu tiên số một. Các biện pháp bù trừ như cảnh báo cửa, camera và bảo vệ phản ứng sẽ xử lý rủi ro tài sản trong lúc sự cố.',
        },
      },
      {
        id: 'C',
        text: { en: 'Require a badge to exit, powered by a UPS.', vi: 'Yêu cầu quẹt thẻ để ra, cấp nguồn bằng UPS.' },
        why: {
          en: 'A UPS can fail or run out, and badge-to-exit still delays escape. Egress must not depend on an authentication system during an emergency.',
          vi: 'UPS có thể hỏng hoặc hết pin, và việc phải quẹt thẻ để ra vẫn làm chậm việc thoát hiểm. Lối thoát không được phụ thuộc vào hệ thống xác thực khi khẩn cấp.',
        },
      },
      {
        id: 'D',
        text: { en: 'Let the security manager decide remotely when the alarm fires.', vi: 'Để quản lý bảo mật quyết định từ xa khi chuông báo cháy kêu.' },
        why: {
          en: 'A manual remote decision adds delay and a single point of failure exactly when time matters most.',
          vi: 'Quyết định thủ công từ xa gây chậm trễ và tạo điểm lỗi duy nhất đúng vào lúc thời gian quan trọng nhất.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Fail-safe means the system fails in a state that protects people (door unlocks). Fail-secure means it fails in a state that protects assets (door stays locked). When people are at risk, CISSP always picks human safety first, then adds compensating controls for the assets. Check local fire and building codes, which usually require free egress.',
      vi: 'Fail-safe nghĩa là hệ thống khi lỗi sẽ chuyển về trạng thái bảo vệ con người (cửa mở). Fail-secure nghĩa là khi lỗi sẽ chuyển về trạng thái bảo vệ tài sản (cửa giữ khóa). Khi có nguy hiểm cho con người, CISSP luôn chọn an toàn con người trước, rồi bổ sung biện pháp bù trừ cho tài sản. Cần kiểm tra quy chuẩn phòng cháy và xây dựng địa phương, vốn thường yêu cầu lối thoát luôn thông suốt.',
    },
    takeaway: {
      en: 'If any option endangers people, it is wrong. Human life comes first.',
      vi: 'Lựa chọn nào gây nguy hiểm cho con người thì sai. Tính mạng con người luôn đứng đầu.',
    },
    concepts: ['fail-safe', 'fail-secure', 'life safety'],
  },

  // ── Domain 4: Communication and Network Security ─────────────────────────
  {
    id: 'wifi-shared-psk',
    domainId: 'd4',
    title: { en: 'One Wi-Fi password for everyone', vi: 'Một mật khẩu Wi-Fi cho tất cả' },
    situation: {
      en: 'A branch office of 80 staff uses WPA2-Personal with one shared passphrase. Staff turnover is high, the passphrase has not changed in three years, and an audit found that two former employees still connect from the car park.',
      vi: 'Một chi nhánh 80 nhân viên dùng WPA2-Personal với một passphrase chung. Nhân sự thay đổi nhiều, passphrase ba năm chưa đổi, và đợt audit phát hiện hai nhân viên cũ vẫn kết nối được từ bãi đỗ xe.',
    },
    question: { en: 'What is the BEST long-term fix?', vi: 'Giải pháp lâu dài TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Change the passphrase every time someone leaves.', vi: 'Đổi passphrase mỗi khi có người nghỉ việc.' },
        why: {
          en: 'Better than nothing, but it disrupts everyone, the new key is shared again immediately, and you still cannot tell users apart.',
          vi: 'Tốt hơn không làm gì, nhưng làm gián đoạn mọi người, key mới lại bị chia sẻ ngay, và vẫn không phân biệt được từng người dùng.',
        },
      },
      {
        id: 'B',
        text: { en: 'Hide the SSID and enable MAC address filtering.', vi: 'Ẩn SSID và bật lọc địa chỉ MAC.' },
        why: {
          en: 'Hidden SSIDs are visible in probe traffic and MAC addresses are easy to spoof. This is obscurity, not access control.',
          vi: 'SSID ẩn vẫn lộ trong gói probe và địa chỉ MAC rất dễ giả mạo. Đây là che giấu, không phải kiểm soát truy cập.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Move to WPA3-Enterprise (802.1X) with a RADIUS server tied to the corporate directory.',
          vi: 'Chuyển sang WPA3-Enterprise (802.1X) với RADIUS server gắn với directory của công ty.',
        },
        why: {
          en: 'Correct. Each user authenticates with their own credentials or certificate. Disabling the directory account at termination removes Wi-Fi access too, and logs show who connected.',
          vi: 'Đúng. Mỗi người xác thực bằng thông tin đăng nhập hoặc chứng chỉ riêng. Khi vô hiệu hóa tài khoản directory lúc nghỉ việc thì quyền Wi-Fi cũng mất, và log cho biết ai đã kết nối.',
        },
      },
      {
        id: 'D',
        text: { en: 'Reduce the access points\' transmit power so the signal does not reach the car park.', vi: 'Giảm công suất phát của access point để sóng không ra tới bãi đỗ xe.' },
        why: {
          en: 'A directional antenna defeats this, and the real problem, shared credentials that cannot be revoked, is unchanged.',
          vi: 'Ăng-ten định hướng dễ dàng vượt qua cách này, và vấn đề gốc là thông tin đăng nhập dùng chung không thu hồi được thì vẫn còn nguyên.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'The root cause is a shared secret that gives no individual accountability. Enterprise mode with 802.1X/EAP and RADIUS gives per-user authentication, central revocation, per-session keys and auditing. On CISSP, prefer the answer that fixes the root cause with identity-based access over cosmetic measures.',
      vi: 'Nguyên nhân gốc là bí mật dùng chung, không gắn trách nhiệm cho từng cá nhân. Chế độ Enterprise với 802.1X/EAP và RADIUS cho phép xác thực từng người, thu hồi tập trung, khóa riêng cho từng phiên và ghi log kiểm toán. Trong CISSP, ưu tiên đáp án xử lý nguyên nhân gốc bằng truy cập dựa trên định danh, thay vì biện pháp bề mặt.',
    },
    takeaway: {
      en: 'Shared secrets break accountability. Fix with per-user authentication (802.1X).',
      vi: 'Bí mật dùng chung phá vỡ trách nhiệm giải trình. Khắc phục bằng xác thực từng người (802.1X).',
    },
    concepts: ['802.1X', 'WPA3', 'RADIUS', 'accountability'],
  },
  {
    id: 'ot-network-segmentation',
    domainId: 'd4',
    title: { en: 'Factory PLCs on the office LAN', vi: 'PLC nhà máy nằm chung mạng văn phòng' },
    situation: {
      en: 'A manufacturing plant\'s PLCs and HMIs sit on the same flat network as office PCs. The PLCs run firmware that cannot be patched without a production shutdown, and the vendor does not support antivirus on them. A phishing email recently infected an office PC.',
      vi: 'PLC và HMI của một nhà máy sản xuất nằm chung mạng phẳng với máy tính văn phòng. PLC chạy firmware không thể vá nếu không dừng dây chuyền, và nhà cung cấp không hỗ trợ cài antivirus. Gần đây một email phishing đã làm nhiễm mã độc một máy tính văn phòng.',
    },
    question: { en: 'What should be done FIRST to reduce risk to the PLCs?', vi: 'Nên làm gì ĐẦU TIÊN để giảm rủi ro cho PLC?' },
    options: [
      {
        id: 'A',
        text: {
          en: 'Segment the OT network from IT with a firewall and an industrial DMZ, allowing only the specific flows that are needed.',
          vi: 'Phân tách mạng OT khỏi IT bằng firewall và một industrial DMZ, chỉ cho phép những luồng kết nối thật sự cần thiết.',
        },
        why: {
          en: 'Correct. When systems cannot be patched or run endpoint agents, network isolation is the main compensating control. It contains threats coming from the IT side.',
          vi: 'Đúng. Khi hệ thống không vá được và không cài được agent, cô lập mạng là biện pháp bù trừ chính. Nó ngăn các mối đe dọa lan từ phía IT sang.',
        },
      },
      {
        id: 'B',
        text: { en: 'Schedule an emergency shutdown to patch all PLC firmware.', vi: 'Lên lịch dừng khẩn cấp để vá toàn bộ firmware PLC.' },
        why: {
          en: 'Unplanned downtime is a large business impact, and patching does not stop the next unpatched flaw from being reachable. In OT, availability and safety come first.',
          vi: 'Dừng ngoài kế hoạch gây tác động lớn đến kinh doanh, và vá lỗi không ngăn được lỗ hổng tiếp theo vẫn bị tiếp cận. Trong OT, tính sẵn sàng và an toàn được ưu tiên.',
        },
      },
      {
        id: 'C',
        text: { en: 'Install antivirus on the PLCs anyway.', vi: 'Vẫn cài antivirus lên PLC.' },
        why: {
          en: 'Unsupported software on controllers can cause crashes or unsafe behaviour and may void vendor support.',
          vi: 'Cài phần mềm không được hỗ trợ lên bộ điều khiển có thể gây treo, hoạt động không an toàn và mất hỗ trợ từ nhà cung cấp.',
        },
      },
      {
        id: 'D',
        text: { en: 'Give engineers VPN access so they can manage PLCs from home.', vi: 'Cấp VPN để kỹ sư quản lý PLC từ nhà.' },
        why: {
          en: 'This adds a new remote attack path to the most sensitive systems instead of reducing exposure.',
          vi: 'Cách này mở thêm đường tấn công từ xa vào hệ thống nhạy cảm nhất thay vì giảm mức phơi nhiễm.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Industrial control systems prioritise safety and availability, and many cannot be patched quickly. The standard approach (ISA/IEC 62443 zones and conduits, the Purdue model) is to segment OT into zones, put an industrial DMZ between IT and OT, and allow only required, monitored conduits. Segmentation limits lateral movement from compromised office machines.',
      vi: 'Hệ thống điều khiển công nghiệp ưu tiên an toàn và tính sẵn sàng, và nhiều thiết bị không thể vá nhanh. Cách tiếp cận chuẩn (zones và conduits theo ISA/IEC 62443, mô hình Purdue) là chia OT thành các vùng, đặt industrial DMZ giữa IT và OT, và chỉ cho phép các kết nối cần thiết, có giám sát. Phân đoạn mạng hạn chế lateral movement từ máy văn phòng bị xâm nhập.',
    },
    takeaway: {
      en: 'Cannot patch? Isolate. Segmentation is the compensating control for legacy and OT systems.',
      vi: 'Không vá được? Hãy cô lập. Phân đoạn mạng là biện pháp bù trừ cho hệ thống cũ và OT.',
    },
    concepts: ['segmentation', 'ICS/OT', 'Purdue model', 'compensating control'],
  },
  {
    id: 'ipsec-site-to-site',
    domainId: 'd4',
    title: { en: 'Choosing an IPsec mode', vi: 'Chọn chế độ IPsec' },
    situation: {
      en: 'Two offices will be connected over the internet by a VPN between their edge firewalls. Traffic between internal hosts must be encrypted, and the internal IP addressing should not be visible on the internet. Both firewalls sit behind NAT devices from the ISP.',
      vi: 'Hai văn phòng sẽ được kết nối qua internet bằng VPN giữa hai firewall biên. Lưu lượng giữa các máy nội bộ phải được mã hóa, và địa chỉ IP nội bộ không được lộ ra internet. Cả hai firewall đều nằm sau thiết bị NAT của nhà mạng.',
    },
    question: { en: 'Which configuration fits BEST?', vi: 'Cấu hình nào phù hợp NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'AH in transport mode.', vi: 'AH ở transport mode.' },
        why: {
          en: 'AH provides integrity and authentication but no encryption, and it breaks through NAT because it authenticates the IP header.',
          vi: 'AH cung cấp toàn vẹn và xác thực nhưng không mã hóa, và không đi qua NAT được vì nó xác thực cả IP header.',
        },
      },
      {
        id: 'B',
        text: { en: 'ESP in transport mode.', vi: 'ESP ở transport mode.' },
        why: {
          en: 'Transport mode protects only the payload and keeps the original IP header, so internal addressing is exposed. It is meant for host-to-host use.',
          vi: 'Transport mode chỉ bảo vệ payload và giữ nguyên IP header gốc, nên địa chỉ nội bộ bị lộ. Chế độ này dành cho kết nối host-to-host.',
        },
      },
      {
        id: 'C',
        text: { en: 'ESP in tunnel mode with NAT traversal (UDP 4500).', vi: 'ESP ở tunnel mode với NAT traversal (UDP 4500).' },
        why: {
          en: 'Correct. Tunnel mode encrypts the whole original packet, including internal IP headers, inside a new outer header between the gateways. NAT-T wraps ESP in UDP so it passes NAT.',
          vi: 'Đúng. Tunnel mode mã hóa toàn bộ gói tin gốc, bao gồm IP header nội bộ, bên trong một header mới giữa hai gateway. NAT-T bọc ESP trong UDP để đi qua NAT.',
        },
      },
      {
        id: 'D',
        text: { en: 'AH in tunnel mode.', vi: 'AH ở tunnel mode.' },
        why: {
          en: 'Still no confidentiality, because AH never encrypts.',
          vi: 'Vẫn không đảm bảo bí mật, vì AH không bao giờ mã hóa.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'IPsec has two protocols and two modes. AH = integrity + origin authentication, no encryption. ESP = confidentiality, plus integrity and authentication. Transport mode protects the payload (host-to-host). Tunnel mode wraps the whole packet (gateway-to-gateway, site-to-site VPN). IKE negotiates the security associations.',
      vi: 'IPsec có hai giao thức và hai chế độ. AH = toàn vẹn + xác thực nguồn gốc, không mã hóa. ESP = bí mật, kèm toàn vẹn và xác thực. Transport mode bảo vệ payload (host-to-host). Tunnel mode bọc toàn bộ gói tin (gateway-to-gateway, VPN site-to-site). IKE dùng để thương lượng các security association.',
    },
    takeaway: {
      en: 'Need encryption → ESP. Site-to-site → tunnel mode.',
      vi: 'Cần mã hóa → ESP. Site-to-site → tunnel mode.',
    },
    concepts: ['IPsec', 'ESP', 'AH', 'tunnel mode'],
  },

  // ── Domain 5: Identity and Access Management ─────────────────────────────
  {
    id: 'hostile-termination',
    domainId: 'd5',
    title: { en: 'A tense termination', vi: 'Một buổi cho thôi việc căng thẳng' },
    situation: {
      en: 'HR tells you that a senior system administrator will be dismissed at 10:00 tomorrow for misconduct. He has domain admin rights, VPN access and the root password to several appliances. HR expects him to react badly.',
      vi: 'HR báo rằng một quản trị hệ thống cấp cao sẽ bị cho thôi việc lúc 10:00 sáng mai vì vi phạm kỷ luật. Anh ấy có quyền domain admin, truy cập VPN và mật khẩu root của nhiều thiết bị. HR dự đoán anh ấy sẽ phản ứng tiêu cực.',
    },
    question: { en: 'When should his access be removed?', vi: 'Khi nào nên thu hồi quyền truy cập của anh ấy?' },
    options: [
      {
        id: 'A',
        text: { en: 'Today, as soon as HR tells you.', vi: 'Ngay hôm nay, khi HR vừa báo.' },
        why: {
          en: 'Cutting access a day early tips him off and may itself trigger damage or a dispute before the company has acted formally.',
          vi: 'Cắt quyền sớm một ngày sẽ khiến anh ấy nghi ngờ và có thể gây ra phá hoại hoặc tranh chấp trước khi công ty chính thức hành động.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'At the same time as he is told, coordinated with HR, then rotate any shared or privileged credentials he knew.',
          vi: 'Cùng lúc anh ấy được thông báo, phối hợp với HR, sau đó đổi mọi mật khẩu dùng chung hoặc đặc quyền mà anh ấy biết.',
        },
        why: {
          en: 'Correct. Disable accounts while the meeting happens so there is no window to retaliate, then change shared root and service passwords, revoke keys, tokens and certificates, and collect devices.',
          vi: 'Đúng. Vô hiệu hóa tài khoản đúng lúc buổi họp diễn ra để không có khoảng hở cho việc trả đũa, sau đó đổi mật khẩu root và service dùng chung, thu hồi key, token, chứng chỉ và thu lại thiết bị.',
        },
      },
      {
        id: 'C',
        text: { en: 'Right after the meeting ends.', vi: 'Ngay sau khi buổi họp kết thúc.' },
        why: {
          en: 'Even a short gap is enough for a privileged user with remote access to cause serious harm.',
          vi: 'Chỉ một khoảng hở ngắn cũng đủ để người có đặc quyền và quyền truy cập từ xa gây thiệt hại nghiêm trọng.',
        },
      },
      {
        id: 'D',
        text: { en: 'At the end of his notice period, as per the standard leaver process.', vi: 'Khi hết thời gian báo trước, theo quy trình nghỉ việc thông thường.' },
        why: {
          en: 'A standard leaver process is fine for friendly departures, not for a hostile termination of a privileged user.',
          vi: 'Quy trình nghỉ việc thông thường phù hợp với trường hợp nghỉ thân thiện, không phù hợp khi cho thôi việc một người có đặc quyền trong bối cảnh căng thẳng.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'For involuntary terminations, revoke access at the moment of notification, coordinated in advance with HR and the manager. Remember the parts people forget: shared accounts, service account passwords, API keys, MFA tokens, physical badges, and remote access. Have the user escorted and do an exit interview reminding them of NDA obligations.',
      vi: 'Với trường hợp cho thôi việc không tự nguyện, thu hồi quyền đúng thời điểm thông báo, phối hợp trước với HR và quản lý. Nhớ những phần hay bị bỏ sót: tài khoản dùng chung, mật khẩu service account, API key, token MFA, thẻ ra vào và truy cập từ xa. Bố trí người đi cùng và phỏng vấn nghỉ việc, nhắc lại nghĩa vụ NDA.',
    },
    takeaway: {
      en: 'Hostile termination: disable access during the notification, not before, not after.',
      vi: 'Cho thôi việc căng thẳng: thu hồi quyền trong lúc thông báo, không trước, không sau.',
    },
    concepts: ['deprovisioning', 'termination', 'privileged access'],
  },
  {
    id: 'privilege-creep',
    domainId: 'd5',
    title: { en: 'Twelve years, five departments', vi: 'Mười hai năm, năm phòng ban' },
    situation: {
      en: 'An internal audit finds that an accountant who has moved through five departments in twelve years still has access to payroll, procurement approval and the treasury system. Several other long-serving staff show the same pattern.',
      vi: 'Kiểm toán nội bộ phát hiện một kế toán viên đã chuyển qua năm phòng ban trong mười hai năm vẫn còn quyền vào hệ thống lương, phê duyệt mua hàng và hệ thống ngân quỹ. Nhiều nhân viên lâu năm khác cũng có tình trạng tương tự.',
    },
    question: { en: 'What is the BEST way to address this?', vi: 'Cách xử lý TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Remove the accountant\'s extra access.', vi: 'Thu hồi các quyền thừa của kế toán viên đó.' },
        why: {
          en: 'Necessary, but it fixes one instance. The audit shows a process failure that will keep producing the same problem.',
          vi: 'Cần làm, nhưng chỉ sửa một trường hợp. Kết quả audit cho thấy lỗi quy trình và vấn đề sẽ còn lặp lại.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Introduce access reviews on every role change plus periodic recertification by managers and data owners.',
          vi: 'Áp dụng rà soát quyền mỗi khi đổi vai trò, cộng với chứng nhận lại quyền định kỳ bởi quản lý và data owner.',
        },
        why: {
          en: 'Correct. This fixes the root cause of privilege creep by removing old access on transfer and catching anything missed through regular reviews.',
          vi: 'Đúng. Cách này xử lý nguyên nhân gốc của privilege creep: thu hồi quyền cũ khi chuyển vị trí và phát hiện phần bị sót qua các đợt rà soát định kỳ.',
        },
      },
      {
        id: 'C',
        text: { en: 'Discipline the accountant for keeping access they did not need.', vi: 'Kỷ luật kế toán viên vì giữ quyền không cần thiết.' },
        why: {
          en: 'The user did not grant the access. Removing it was the organisation\'s responsibility.',
          vi: 'Người dùng không tự cấp quyền. Thu hồi quyền là trách nhiệm của tổ chức.',
        },
      },
      {
        id: 'D',
        text: { en: 'Buy a privileged access management (PAM) tool.', vi: 'Mua công cụ quản lý truy cập đặc quyền (PAM).' },
        why: {
          en: 'PAM controls administrative accounts. These are business application permissions, and a tool without a review process will not remove them.',
          vi: 'PAM kiểm soát tài khoản quản trị. Đây là quyền ứng dụng nghiệp vụ, và công cụ mà không có quy trình rà soát thì không thu hồi được chúng.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Privilege creep (or aggregation) is the slow build-up of access as people change roles. It breaks least privilege and can break separation of duties: here the same person could approve purchases and move money. The control is lifecycle management: provision on joining, adjust on moving, revoke on leaving, and recertify periodically.',
      vi: 'Privilege creep (tích lũy quyền) là việc quyền tăng dần khi nhân viên đổi vai trò. Nó phá vỡ nguyên tắc đặc quyền tối thiểu và có thể phá vỡ phân tách nhiệm vụ: ở đây cùng một người có thể vừa phê duyệt mua hàng vừa chuyển tiền. Biện pháp là quản lý vòng đời: cấp quyền khi vào, điều chỉnh khi chuyển, thu hồi khi nghỉ, và chứng nhận lại định kỳ.',
    },
    takeaway: {
      en: 'Audit finding about many users = process problem. Pick the answer that fixes the process.',
      vi: 'Phát hiện audit liên quan nhiều người = vấn đề quy trình. Chọn đáp án sửa quy trình.',
    },
    concepts: ['privilege creep', 'least privilege', 'access review', 'separation of duties'],
  },
  {
    id: 'saas-federation',
    domainId: 'd5',
    title: { en: 'Logging in to a new SaaS HR system', vi: 'Đăng nhập vào hệ thống HR SaaS mới' },
    situation: {
      en: 'The company is moving to a cloud HR platform. Requirements: staff use their existing corporate login with MFA, the vendor must never store their passwords, and access must end automatically when someone leaves.',
      vi: 'Công ty chuyển sang một nền tảng HR trên cloud. Yêu cầu: nhân viên dùng tài khoản công ty hiện có kèm MFA, nhà cung cấp không bao giờ được lưu mật khẩu, và quyền truy cập phải tự động chấm dứt khi có người nghỉ việc.',
    },
    question: { en: 'Which approach meets these requirements?', vi: 'Cách nào đáp ứng các yêu cầu này?' },
    options: [
      {
        id: 'A',
        text: { en: 'Synchronise password hashes from the directory to the vendor.', vi: 'Đồng bộ hash mật khẩu từ directory sang nhà cung cấp.' },
        why: {
          en: 'The vendor would then store credential material, which breaks a stated requirement and widens the impact of a vendor breach.',
          vi: 'Nhà cung cấp khi đó sẽ lưu thông tin xác thực, vi phạm yêu cầu đã nêu và mở rộng thiệt hại nếu nhà cung cấp bị xâm nhập.',
        },
      },
      {
        id: 'B',
        text: { en: 'Create separate vendor accounts with a strong password policy.', vi: 'Tạo tài khoản riêng trên hệ thống nhà cung cấp với chính sách mật khẩu mạnh.' },
        why: {
          en: 'Separate accounts mean another password to manage and must be removed by hand when people leave.',
          vi: 'Tài khoản riêng nghĩa là thêm một mật khẩu phải quản lý và phải xóa thủ công khi có người nghỉ.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Federate with SAML 2.0 or OpenID Connect: the corporate IdP authenticates users, the SaaS app trusts its assertions, and SCIM handles provisioning.',
          vi: 'Liên kết (federation) bằng SAML 2.0 hoặc OpenID Connect: IdP của công ty xác thực người dùng, ứng dụng SaaS tin cậy assertion từ IdP, và SCIM xử lý cấp/thu hồi tài khoản.',
        },
        why: {
          en: 'Correct. Passwords and MFA stay at the identity provider; the service provider only receives signed assertions. Disabling the user at the IdP blocks login, and SCIM deprovisions the account.',
          vi: 'Đúng. Mật khẩu và MFA nằm ở identity provider; service provider chỉ nhận assertion đã ký. Vô hiệu hóa người dùng ở IdP sẽ chặn đăng nhập, và SCIM thu hồi tài khoản.',
        },
      },
      {
        id: 'D',
        text: { en: 'Extend the on-premises Kerberos realm to the vendor over the internet.', vi: 'Mở rộng Kerberos realm nội bộ sang nhà cung cấp qua internet.' },
        why: {
          en: 'Kerberos is built for trusted internal networks. Exposing KDCs or creating realm trusts with a SaaS vendor is impractical and risky.',
          vi: 'Kerberos được thiết kế cho mạng nội bộ tin cậy. Mở KDC ra ngoài hoặc tạo trust realm với nhà cung cấp SaaS là không thực tế và rủi ro.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Federated identity separates the identity provider (authenticates, holds credentials) from the service provider (consumes assertions). SAML 2.0 uses XML assertions and is common for enterprise web SSO; OpenID Connect adds an identity layer on top of OAuth 2.0. OAuth 2.0 on its own is for authorization (delegated access), not authentication.',
      vi: 'Federated identity tách identity provider (xác thực, giữ thông tin đăng nhập) khỏi service provider (tiếp nhận assertion). SAML 2.0 dùng assertion XML và phổ biến cho SSO web doanh nghiệp; OpenID Connect bổ sung lớp định danh trên OAuth 2.0. Bản thân OAuth 2.0 dùng cho ủy quyền (authorization), không phải xác thực (authentication).',
    },
    takeaway: {
      en: 'SSO to SaaS → federation (SAML/OIDC). OAuth alone = authorization, not authentication.',
      vi: 'SSO lên SaaS → federation (SAML/OIDC). OAuth đơn thuần = ủy quyền, không phải xác thực.',
    },
    concepts: ['federation', 'SAML', 'OIDC', 'SCIM'],
  },

  // ── Domain 6: Security Assessment and Testing ────────────────────────────
  {
    id: 'pentest-authorization',
    domainId: 'd6',
    title: { en: 'Verbal OK to start the pentest', vi: 'Được đồng ý miệng để bắt đầu pentest' },
    situation: {
      en: 'You lead an external penetration test. The IT manager told you on a call, "Go ahead, test everything from Monday." There is no signed document yet, and Monday is tomorrow.',
      vi: 'Bạn dẫn dắt một đợt penetration test từ bên ngoài. Trưởng phòng IT nói qua điện thoại: "Cứ làm đi, test hết từ thứ Hai." Chưa có văn bản ký nào, và thứ Hai là ngày mai.',
    },
    question: { en: 'What should you do before testing?', vi: 'Bạn nên làm gì trước khi test?' },
    options: [
      {
        id: 'A',
        text: { en: 'Start Monday. The IT manager has authority over the systems.', vi: 'Bắt đầu thứ Hai. Trưởng phòng IT có thẩm quyền với hệ thống.' },
        why: {
          en: 'Verbal approval from a mid-level manager may not be valid authority and gives no protection if something breaks or is disputed.',
          vi: 'Đồng ý miệng từ quản lý cấp trung có thể không đủ thẩm quyền và không bảo vệ bạn nếu có sự cố hoặc tranh chấp.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Get written authorization from senior management with scope, rules of engagement, timing and emergency contacts.',
          vi: 'Lấy văn bản ủy quyền từ lãnh đạo cấp cao, ghi rõ phạm vi, rules of engagement, thời gian và đầu mối liên hệ khẩn cấp.',
        },
        why: {
          en: 'Correct. Without written permission, a penetration test is unauthorized access. The document defines what is in and out of scope, allowed techniques and who to call if something goes wrong.',
          vi: 'Đúng. Không có văn bản cho phép thì penetration test chính là truy cập trái phép. Văn bản xác định phạm vi trong và ngoài, kỹ thuật được phép và người cần gọi khi có sự cố.',
        },
      },
      {
        id: 'C',
        text: { en: 'Start with passive reconnaissance only until the paperwork arrives.', vi: 'Chỉ làm thu thập thông tin thụ động cho đến khi có giấy tờ.' },
        why: {
          en: 'Tempting, but the engagement has not started. Without agreed scope you do not even know which assets are yours to look at.',
          vi: 'Hấp dẫn, nhưng hợp đồng chưa bắt đầu. Chưa có phạm vi thống nhất thì bạn còn không biết tài sản nào được phép tìm hiểu.',
        },
      },
      {
        id: 'D',
        text: { en: 'Record the call as proof and begin.', vi: 'Ghi âm cuộc gọi làm bằng chứng rồi bắt đầu.' },
        why: {
          en: 'A recording does not define scope or rules, and it may not show the person had authority to approve.',
          vi: 'Bản ghi âm không xác định phạm vi hay quy tắc, và có thể không chứng minh người đó có thẩm quyền phê duyệt.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Every penetration test starts with written, signed authorization from someone with the authority to grant it (often called the "get out of jail free" letter), plus agreed scope and rules of engagement. The phases that follow are typically planning, discovery/reconnaissance, attack/exploitation and reporting.',
      vi: 'Mọi đợt penetration test đều bắt đầu bằng văn bản ủy quyền có chữ ký của người có thẩm quyền (thường gọi là thư "get out of jail free"), cùng phạm vi và rules of engagement đã thống nhất. Các giai đoạn tiếp theo thường là lập kế hoạch, khám phá/thu thập thông tin, tấn công/khai thác và báo cáo.',
    },
    takeaway: {
      en: 'No written, senior-level authorization = no testing. Not even "light" testing.',
      vi: 'Không có văn bản ủy quyền cấp cao = không test. Kể cả test "nhẹ".',
    },
    concepts: ['penetration testing', 'rules of engagement', 'authorization'],
  },
  {
    id: 'soc2-type2',
    domainId: 'd6',
    title: { en: 'Assurance from a SaaS vendor', vi: 'Đảm bảo từ nhà cung cấp SaaS' },
    situation: {
      en: 'You are assessing a SaaS vendor that will store your customers\' personal data. You cannot audit their data centres yourself. You want independent evidence that their security controls were not only designed well but actually worked over the past year.',
      vi: 'Bạn đang đánh giá một nhà cung cấp SaaS sẽ lưu dữ liệu cá nhân của khách hàng công ty bạn. Bạn không thể tự audit trung tâm dữ liệu của họ. Bạn muốn có bằng chứng độc lập rằng các biện pháp bảo mật không chỉ được thiết kế tốt mà còn thực sự hoạt động trong năm vừa qua.',
    },
    question: { en: 'Which report should you request?', vi: 'Bạn nên yêu cầu báo cáo nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'SOC 1 Type I', vi: 'SOC 1 Type I' },
        why: {
          en: 'SOC 1 covers controls relevant to financial reporting, and Type I is a point-in-time view of design only.',
          vi: 'SOC 1 bao quát các kiểm soát liên quan đến báo cáo tài chính, và Type I chỉ đánh giá thiết kế tại một thời điểm.',
        },
      },
      {
        id: 'B',
        text: { en: 'SOC 2 Type I', vi: 'SOC 2 Type I' },
        why: {
          en: 'Right scope (security and the other trust services criteria), but Type I only shows controls were suitably designed on one date.',
          vi: 'Đúng phạm vi (bảo mật và các trust services criteria khác), nhưng Type I chỉ cho thấy kiểm soát được thiết kế phù hợp tại một ngày.',
        },
      },
      {
        id: 'C',
        text: { en: 'SOC 2 Type II', vi: 'SOC 2 Type II' },
        why: {
          en: 'Correct. SOC 2 covers security, availability, processing integrity, confidentiality and privacy, and Type II tests operating effectiveness over a period, usually 6 to 12 months.',
          vi: 'Đúng. SOC 2 bao quát bảo mật, tính sẵn sàng, toàn vẹn xử lý, bí mật và quyền riêng tư, và Type II kiểm tra hiệu quả vận hành trong một khoảng thời gian, thường 6 đến 12 tháng.',
        },
      },
      {
        id: 'D',
        text: { en: 'SOC 3', vi: 'SOC 3' },
        why: {
          en: 'SOC 3 is a short public summary with no detailed test results, meant for marketing rather than due diligence.',
          vi: 'SOC 3 là bản tóm tắt công khai, không có kết quả kiểm tra chi tiết, dùng cho marketing hơn là thẩm định.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'SOC 1 = internal controls over financial reporting. SOC 2 = trust services criteria (security, availability, processing integrity, confidentiality, privacy), shared under NDA. SOC 3 = general-use summary of SOC 2. Type I = design at a point in time. Type II = design and operating effectiveness over a period. For vendor security due diligence, SOC 2 Type II is the usual answer.',
      vi: 'SOC 1 = kiểm soát nội bộ về báo cáo tài chính. SOC 2 = trust services criteria (bảo mật, sẵn sàng, toàn vẹn xử lý, bí mật, quyền riêng tư), chia sẻ theo NDA. SOC 3 = bản tóm tắt công khai của SOC 2. Type I = thiết kế tại một thời điểm. Type II = thiết kế và hiệu quả vận hành trong một khoảng thời gian. Khi thẩm định bảo mật nhà cung cấp, SOC 2 Type II là đáp án thường gặp.',
    },
    takeaway: {
      en: 'Security assurance over time from a vendor → SOC 2 Type II.',
      vi: 'Đảm bảo bảo mật theo thời gian từ nhà cung cấp → SOC 2 Type II.',
    },
    concepts: ['SOC reports', 'third-party assurance', 'SSAE 18'],
  },
  {
    id: 'synthetic-monitoring',
    domainId: 'd6',
    title: { en: 'Checkout broken at 3 a.m.', vi: 'Thanh toán lỗi lúc 3 giờ sáng' },
    situation: {
      en: 'An online shop discovered that its checkout page had been failing from 02:00 to 07:00. Nobody noticed because few customers shop at night, and the first complaint arrived at 07:15. Management wants to detect this kind of failure within minutes.',
      vi: 'Một cửa hàng online phát hiện trang thanh toán đã lỗi từ 02:00 đến 07:00. Không ai biết vì ban đêm ít khách mua, và khiếu nại đầu tiên đến lúc 07:15. Ban lãnh đạo muốn phát hiện loại sự cố này trong vòng vài phút.',
    },
    question: { en: 'Which technique fits BEST?', vi: 'Kỹ thuật nào phù hợp NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Real user monitoring (RUM).', vi: 'Giám sát người dùng thật (RUM).' },
        why: {
          en: 'RUM measures what real users experience, so when there are no users there is nothing to measure. That is exactly the gap here.',
          vi: 'RUM đo trải nghiệm của người dùng thật, nên khi không có người dùng thì không có gì để đo. Đó chính là lỗ hổng trong tình huống này.',
        },
      },
      {
        id: 'B',
        text: { en: 'Synthetic transactions that run a scripted checkout every few minutes and alert on failure.', vi: 'Giao dịch tổng hợp (synthetic transaction) chạy kịch bản thanh toán vài phút một lần và cảnh báo khi lỗi.' },
        why: {
          en: 'Correct. Synthetic monitoring generates its own test traffic on a schedule, so it detects failures even when no customers are active.',
          vi: 'Đúng. Synthetic monitoring tự tạo lưu lượng kiểm tra theo lịch, nên phát hiện lỗi ngay cả khi không có khách hàng nào hoạt động.',
        },
      },
      {
        id: 'C',
        text: { en: 'A quarterly vulnerability scan.', vi: 'Quét lỗ hổng hằng quý.' },
        why: {
          en: 'Vulnerability scanning looks for weaknesses, not functional outages, and quarterly is far too slow.',
          vi: 'Quét lỗ hổng tìm điểm yếu, không phát hiện sự cố chức năng, và hằng quý là quá chậm.',
        },
      },
      {
        id: 'D',
        text: { en: 'Static code analysis of the checkout module.', vi: 'Phân tích mã tĩnh của module thanh toán.' },
        why: {
          en: 'SAST finds coding flaws before deployment. It cannot see a runtime failure in production.',
          vi: 'SAST tìm lỗi lập trình trước khi triển khai. Nó không thấy được lỗi khi đang chạy ở production.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Passive monitoring (RUM) watches real traffic and is great for understanding actual user experience. Active or synthetic monitoring runs scripted transactions to test availability and function on a schedule. They complement each other; for low-traffic periods and critical flows, synthetic checks give predictable detection time.',
      vi: 'Giám sát thụ động (RUM) theo dõi lưu lượng thật, rất tốt để hiểu trải nghiệm thực tế của người dùng. Giám sát chủ động hay synthetic chạy giao dịch kịch bản để kiểm tra tính sẵn sàng và chức năng theo lịch. Hai cách bổ trợ nhau; với giai đoạn ít lưu lượng và luồng nghiệp vụ quan trọng, kiểm tra synthetic cho thời gian phát hiện ổn định.',
    },
    takeaway: {
      en: 'No users, still need detection → synthetic transactions.',
      vi: 'Không có người dùng mà vẫn cần phát hiện lỗi → synthetic transaction.',
    },
    concepts: ['synthetic monitoring', 'RUM', 'availability testing'],
  },

  // ── Domain 7: Security Operations ────────────────────────────────────────
  {
    id: 'ransomware-containment',
    domainId: 'd7',
    title: { en: 'Ransomware on the file server', vi: 'Ransomware trên file server' },
    situation: {
      en: 'At 14:20 the SOC sees mass file renames with a ".lock" extension on the main file server and ransom notes appearing in shared folders. Two workstations are also showing the same activity. The incident response plan has been invoked.',
      vi: 'Lúc 14:20, SOC thấy hàng loạt file bị đổi tên với đuôi ".lock" trên file server chính và các file đòi tiền chuộc xuất hiện trong thư mục chia sẻ. Hai máy trạm cũng có hoạt động tương tự. Kế hoạch ứng phó sự cố đã được kích hoạt.',
    },
    question: { en: 'What should the team do NEXT?', vi: 'Đội ứng phó nên làm gì TIẾP THEO?' },
    options: [
      {
        id: 'A',
        text: { en: 'Power off the file server immediately.', vi: 'Tắt nguồn file server ngay lập tức.' },
        why: {
          en: 'Pulling power loses volatile evidence such as running processes, network connections and possibly encryption keys in memory.',
          vi: 'Tắt nguồn làm mất chứng cứ dễ bay hơi như tiến trình đang chạy, kết nối mạng và có thể cả khóa mã hóa trong bộ nhớ.',
        },
      },
      {
        id: 'B',
        text: { en: 'Isolate the affected hosts from the network while keeping them powered on.', vi: 'Cô lập các máy bị ảnh hưởng khỏi mạng nhưng vẫn giữ nguồn.' },
        why: {
          en: 'Correct. Containment stops the spread to other systems and backups, while keeping memory evidence available for analysis.',
          vi: 'Đúng. Ngăn chặn (containment) chặn việc lây lan sang hệ thống khác và bản backup, đồng thời giữ được chứng cứ trong bộ nhớ để phân tích.',
        },
      },
      {
        id: 'C',
        text: { en: 'Restore the file server from last night\'s backup.', vi: 'Khôi phục file server từ bản backup tối qua.' },
        why: {
          en: 'Recovery before containment and eradication means the malware can encrypt the restored data again. It also destroys evidence.',
          vi: 'Khôi phục trước khi ngăn chặn và loại bỏ thì mã độc có thể mã hóa lại dữ liệu vừa khôi phục. Việc này còn phá hủy chứng cứ.',
        },
      },
      {
        id: 'D',
        text: { en: 'Contact the attackers to negotiate the ransom.', vi: 'Liên hệ kẻ tấn công để thương lượng tiền chuộc.' },
        why: {
          en: 'Payment is a business and legal decision for senior management, made much later if at all. It does nothing to stop the current spread.',
          vi: 'Trả tiền chuộc là quyết định kinh doanh và pháp lý của lãnh đạo cấp cao, nếu có thì rất muộn về sau. Nó không giúp chặn việc lây lan hiện tại.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Follow the incident lifecycle in order. The ISC2 CBK lists: detection, response, mitigation (containment), reporting, recovery, remediation, lessons learned. NIST SP 800-61 groups it as preparation; detection and analysis; containment, eradication and recovery; post-incident activity. After detection, contain first, and choose containment that preserves evidence.',
      vi: 'Tuân theo vòng đời ứng phó sự cố theo thứ tự. ISC2 CBK liệt kê: phát hiện, phản ứng, giảm thiểu (ngăn chặn), báo cáo, khôi phục, khắc phục, rút kinh nghiệm. NIST SP 800-61 gom lại thành: chuẩn bị; phát hiện và phân tích; ngăn chặn, loại bỏ và khôi phục; hoạt động sau sự cố. Sau khi phát hiện, ngăn chặn trước, và chọn cách ngăn chặn giữ được chứng cứ.',
    },
    takeaway: {
      en: 'Detect → contain → eradicate → recover → lessons learned. Isolate, do not power off.',
      vi: 'Phát hiện → ngăn chặn → loại bỏ → khôi phục → rút kinh nghiệm. Cô lập, đừng tắt nguồn.',
    },
    concepts: ['incident response', 'containment', 'volatile evidence'],
  },
  {
    id: 'forensic-image-integrity',
    domainId: 'd7',
    title: { en: 'Proving the disk image is unchanged', vi: 'Chứng minh bản image ổ đĩa không bị thay đổi' },
    situation: {
      en: 'You seized a laptop from an employee suspected of stealing designs. The case may go to court. You need to analyse the drive and later show the court that your analysis did not alter the evidence.',
      vi: 'Bạn đã thu giữ laptop của một nhân viên bị nghi đánh cắp bản thiết kế. Vụ việc có thể ra tòa. Bạn cần phân tích ổ đĩa và sau đó chứng minh trước tòa rằng việc phân tích không làm thay đổi chứng cứ.',
    },
    question: { en: 'Which approach is BEST?', vi: 'Cách nào TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Boot the laptop and copy the relevant folders to a USB drive.', vi: 'Khởi động laptop và chép các thư mục liên quan ra USB.' },
        why: {
          en: 'Booting changes timestamps, logs and swap. Copying files misses deleted data and slack space.',
          vi: 'Khởi động máy làm thay đổi timestamp, log và swap. Chép file sẽ bỏ sót dữ liệu đã xóa và slack space.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Use a write blocker to make a bit-for-bit image, hash both original and image, analyse a copy, and keep a chain-of-custody log.',
          vi: 'Dùng write blocker để tạo bản image bit-by-bit, tính hash cả bản gốc và bản image, phân tích trên bản sao, và lưu nhật ký chain of custody.',
        },
        why: {
          en: 'Correct. Matching hashes (e.g. SHA-256) show the image equals the original; the write blocker prevents changes; working on a copy protects the master; chain of custody shows who handled the evidence and when.',
          vi: 'Đúng. Hash trùng khớp (ví dụ SHA-256) chứng minh bản image giống bản gốc; write blocker ngăn thay đổi; làm việc trên bản sao bảo vệ bản chính; chain of custody ghi lại ai đã xử lý chứng cứ và khi nào.',
        },
      },
      {
        id: 'C',
        text: { en: 'Analyse the original drive directly so nothing is lost in copying.', vi: 'Phân tích trực tiếp trên ổ gốc để không mất gì khi sao chép.' },
        why: {
          en: 'Working on the original risks altering it, which can make the evidence inadmissible.',
          vi: 'Làm việc trên bản gốc có nguy cơ làm thay đổi nó, khiến chứng cứ có thể không được tòa chấp nhận.',
        },
      },
      {
        id: 'D',
        text: { en: 'Ask the employee\'s manager to sign a statement that the files were on the laptop.', vi: 'Nhờ quản lý của nhân viên ký xác nhận các file có trong laptop.' },
        why: {
          en: 'A statement is not technical proof of integrity and is easily challenged.',
          vi: 'Một bản xác nhận không phải bằng chứng kỹ thuật về tính toàn vẹn và dễ bị phản bác.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Evidence must be relevant, reliable and admissible. Integrity is shown with hashing at acquisition and after analysis; handling is shown with chain of custody (who, what, when, where, why for every transfer). Capture volatile data first when the system is live (order of volatility: registers/cache, memory, network state, processes, disk, logs, archives).',
      vi: 'Chứng cứ phải liên quan, đáng tin cậy và được chấp nhận. Tính toàn vẹn được chứng minh bằng hash lúc thu thập và sau khi phân tích; việc xử lý được chứng minh bằng chain of custody (ai, cái gì, khi nào, ở đâu, vì sao cho mỗi lần chuyển giao). Nếu hệ thống đang chạy, thu thập dữ liệu dễ bay hơi trước (thứ tự: register/cache, bộ nhớ, trạng thái mạng, tiến trình, ổ đĩa, log, bản lưu trữ).',
    },
    takeaway: {
      en: 'Write blocker + hash + work on a copy + chain of custody.',
      vi: 'Write blocker + hash + làm trên bản sao + chain of custody.',
    },
    concepts: ['forensics', 'chain of custody', 'hashing', 'order of volatility'],
  },
  {
    id: 'rto-rpo-strategy',
    domainId: 'd7',
    title: { en: '15 minutes of data, 4 hours of downtime', vi: '15 phút dữ liệu, 4 giờ gián đoạn' },
    situation: {
      en: 'The business impact analysis for the order system says: the business can lose at most 15 minutes of transactions, and the system must be running again within 4 hours of a disaster. The budget is tight.',
      vi: 'Phân tích tác động kinh doanh (BIA) cho hệ thống đặt hàng cho biết: doanh nghiệp chỉ chấp nhận mất tối đa 15 phút giao dịch, và hệ thống phải hoạt động lại trong vòng 4 giờ sau thảm họa. Ngân sách hạn chế.',
    },
    question: { en: 'Which strategy is the MOST cost-effective that meets both targets?', vi: 'Chiến lược nào TIẾT KIỆM NHẤT mà vẫn đáp ứng cả hai mục tiêu?' },
    options: [
      {
        id: 'A',
        text: { en: 'Nightly full backup to tape, restored at a cold site.', vi: 'Backup full hằng đêm ra tape, khôi phục tại cold site.' },
        why: {
          en: 'Up to 24 hours of data loss breaks the 15-minute RPO, and a cold site usually takes days to bring up, breaking the RTO.',
          vi: 'Có thể mất tới 24 giờ dữ liệu, vi phạm RPO 15 phút, và cold site thường mất nhiều ngày để dựng lại, vi phạm RTO.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Asynchronous replication or log shipping every 5 minutes to a warm site.',
          vi: 'Replication bất đồng bộ hoặc log shipping 5 phút một lần sang warm site.',
        },
        why: {
          en: 'Correct. Data at most ~5 minutes old meets the 15-minute RPO, and a warm site with hardware ready can be brought up within hours, meeting the 4-hour RTO at lower cost than a hot site.',
          vi: 'Đúng. Dữ liệu cũ nhất khoảng 5 phút đáp ứng RPO 15 phút, và warm site có sẵn phần cứng có thể khởi động trong vài giờ, đáp ứng RTO 4 giờ với chi phí thấp hơn hot site.',
        },
      },
      {
        id: 'C',
        text: { en: 'Synchronous mirroring to an active-active hot site.', vi: 'Mirroring đồng bộ sang hot site chạy active-active.' },
        why: {
          en: 'It meets both targets, but near-zero RPO and RTO cost far more than the business needs. The question asks for the most cost-effective option.',
          vi: 'Đáp ứng cả hai mục tiêu, nhưng RPO và RTO gần bằng 0 tốn kém hơn nhiều so với nhu cầu. Câu hỏi yêu cầu phương án tiết kiệm nhất.',
        },
      },
      {
        id: 'D',
        text: { en: 'Weekly full plus daily differential backups.', vi: 'Backup full hằng tuần cộng differential hằng ngày.' },
        why: {
          en: 'Daily backups can lose up to a day of transactions, far more than 15 minutes.',
          vi: 'Backup hằng ngày có thể mất tới một ngày giao dịch, nhiều hơn rất nhiều so với 15 phút.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'RPO (recovery point objective) = maximum tolerable data loss, measured backwards from the disaster; it drives backup and replication frequency. RTO (recovery time objective) = maximum time to restore the service; it drives the choice of site (cold: days to weeks, warm: hours to days, hot: minutes to hours). Both must fit within the MTD (maximum tolerable downtime) from the BIA. Choose the cheapest option that meets both.',
      vi: 'RPO (recovery point objective) = lượng dữ liệu mất tối đa chấp nhận được, tính ngược từ thời điểm thảm họa; nó quyết định tần suất backup và replication. RTO (recovery time objective) = thời gian tối đa để khôi phục dịch vụ; nó quyết định loại site (cold: vài ngày đến vài tuần, warm: vài giờ đến vài ngày, hot: vài phút đến vài giờ). Cả hai phải nằm trong MTD (maximum tolerable downtime) từ BIA. Chọn phương án rẻ nhất đáp ứng cả hai.',
    },
    takeaway: {
      en: 'RPO → backup frequency. RTO → site type. Pick the cheapest option that meets both.',
      vi: 'RPO → tần suất backup. RTO → loại site. Chọn phương án rẻ nhất đáp ứng cả hai.',
    },
    concepts: ['RPO', 'RTO', 'MTD', 'BIA', 'recovery sites'],
  },

  // ── Domain 8: Software Development Security ──────────────────────────────
  {
    id: 'security-in-sdlc',
    domainId: 'd8',
    title: { en: 'When should security join the project?', vi: 'Khi nào bảo mật nên tham gia dự án?' },
    situation: {
      en: 'A product team is starting a mobile banking app. The project manager plans to bring in the security team "for a penetration test two weeks before go-live" to keep the schedule fast.',
      vi: 'Một nhóm sản phẩm bắt đầu xây dựng ứng dụng mobile banking. Quản lý dự án định mời team bảo mật "pentest hai tuần trước khi go-live" để giữ tiến độ nhanh.',
    },
    question: { en: 'What should you recommend?', vi: 'Bạn nên đề xuất gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Agree. Testing just before release finds everything that matters.', vi: 'Đồng ý. Kiểm thử ngay trước khi phát hành sẽ tìm ra mọi thứ quan trọng.' },
        why: {
          en: 'Design flaws found two weeks before launch are expensive to fix and often get accepted as risk instead.',
          vi: 'Lỗi thiết kế phát hiện hai tuần trước khi ra mắt rất tốn kém để sửa và thường bị chấp nhận như rủi ro thay vì sửa.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Include security from project initiation: security requirements, threat modelling during design, secure coding and testing throughout.',
          vi: 'Đưa bảo mật vào ngay từ khởi tạo dự án: yêu cầu bảo mật, threat modelling khi thiết kế, lập trình an toàn và kiểm thử xuyên suốt.',
        },
        why: {
          en: 'Correct. Security is cheapest and most effective when defined in requirements and design. Later testing then verifies rather than discovers.',
          vi: 'Đúng. Bảo mật rẻ và hiệu quả nhất khi được xác định từ yêu cầu và thiết kế. Kiểm thử về sau khi đó là để xác minh, không phải để phát hiện.',
        },
      },
      {
        id: 'C',
        text: { en: 'Add security after launch based on incidents seen in production.', vi: 'Bổ sung bảo mật sau khi ra mắt dựa trên các sự cố xảy ra ở production.' },
        why: {
          en: 'Waiting for incidents in a banking app exposes customers and the business to real loss and regulatory action.',
          vi: 'Chờ sự cố xảy ra với ứng dụng ngân hàng sẽ khiến khách hàng và doanh nghiệp chịu tổn thất thật và bị cơ quan quản lý xử lý.',
        },
      },
      {
        id: 'D',
        text: { en: 'Put a web application firewall in front of the API and skip the code-level work.', vi: 'Đặt WAF trước API và bỏ qua các việc ở mức mã nguồn.' },
        why: {
          en: 'A WAF is a useful compensating layer but cannot fix business logic flaws or insecure design.',
          vi: 'WAF là lớp bù trừ hữu ích nhưng không sửa được lỗi logic nghiệp vụ hay thiết kế không an toàn.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'The earlier a defect is found, the cheaper it is to fix. CISSP expects security in every SDLC phase: requirements (security and privacy requirements), design (threat modelling, e.g. STRIDE), development (secure coding, code review, SAST), testing (DAST, penetration testing), deployment and operations (hardening, monitoring, patching) and disposal.',
      vi: 'Lỗi phát hiện càng sớm thì chi phí sửa càng thấp. CISSP yêu cầu bảo mật có mặt ở mọi giai đoạn SDLC: yêu cầu (yêu cầu bảo mật và quyền riêng tư), thiết kế (threat modelling, ví dụ STRIDE), phát triển (lập trình an toàn, code review, SAST), kiểm thử (DAST, penetration test), triển khai và vận hành (hardening, giám sát, vá lỗi) và loại bỏ.',
    },
    takeaway: {
      en: '"When should security be involved?" → at the beginning, and in every phase.',
      vi: '"Khi nào bảo mật nên tham gia?" → ngay từ đầu, và ở mọi giai đoạn.',
    },
    concepts: ['SDLC', 'threat modelling', 'shift left'],
  },
  {
    id: 'sql-injection-fix',
    domainId: 'd8',
    title: { en: 'Fixing SQL injection properly', vi: 'Sửa SQL injection đúng cách' },
    situation: {
      en: 'A penetration test shows that the customer search box builds SQL by concatenating user input, and the tester dumped the users table. Developers propose several fixes.',
      vi: 'Kết quả pentest cho thấy ô tìm kiếm khách hàng tạo câu SQL bằng cách nối chuỗi trực tiếp với dữ liệu người dùng nhập, và tester đã lấy được toàn bộ bảng users. Lập trình viên đề xuất một số cách sửa.',
    },
    question: { en: 'Which fix addresses the root cause BEST?', vi: 'Cách sửa nào xử lý nguyên nhân gốc TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Add a WAF rule that blocks requests containing SQL keywords.', vi: 'Thêm rule WAF chặn các request chứa từ khóa SQL.' },
        why: {
          en: 'Helpful as defence in depth, but filters can be bypassed with encoding tricks and the vulnerable code remains.',
          vi: 'Hữu ích như một lớp phòng thủ chiều sâu, nhưng bộ lọc có thể bị vượt qua bằng kỹ thuật mã hóa và đoạn mã lỗi vẫn còn.',
        },
      },
      {
        id: 'B',
        text: { en: 'Escape single quotes in the input with a custom function.', vi: 'Dùng hàm tự viết để escape dấu nháy đơn trong input.' },
        why: {
          en: 'Home-made escaping is easy to get wrong and misses cases such as numeric parameters or different encodings.',
          vi: 'Tự viết hàm escape rất dễ sai và bỏ sót các trường hợp như tham số kiểu số hoặc các kiểu mã hóa khác nhau.',
        },
      },
      {
        id: 'C',
        text: { en: 'Use parameterized queries (prepared statements), plus allow-list input validation and a least-privilege database account.', vi: 'Dùng truy vấn tham số hóa (prepared statement), kèm kiểm tra đầu vào theo allow-list và tài khoản database đặc quyền tối thiểu.' },
        why: {
          en: 'Correct. Parameterized queries keep data separate from code so input can never change the query structure. Validation and least privilege limit damage from anything missed.',
          vi: 'Đúng. Truy vấn tham số hóa tách dữ liệu khỏi mã lệnh nên input không bao giờ thay đổi được cấu trúc câu truy vấn. Kiểm tra đầu vào và đặc quyền tối thiểu hạn chế thiệt hại nếu có gì bị sót.',
        },
      },
      {
        id: 'D',
        text: { en: 'Hide database error messages from users.', vi: 'Ẩn thông báo lỗi database khỏi người dùng.' },
        why: {
          en: 'This makes exploitation harder (no error-based injection) but blind SQL injection still works.',
          vi: 'Cách này làm việc khai thác khó hơn (không còn error-based injection) nhưng blind SQL injection vẫn hoạt động.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Injection happens when untrusted data is interpreted as code. The primary fix is to keep them separate: parameterized queries or safe ORM APIs. Then add layers: input validation (allow-list), least-privilege DB accounts, generic error messages and a WAF. On the exam, prefer fixing the code over compensating controls when asked for the BEST or root-cause fix.',
      vi: 'Injection xảy ra khi dữ liệu không tin cậy bị hiểu như mã lệnh. Cách sửa chính là tách riêng chúng: truy vấn tham số hóa hoặc API ORM an toàn. Sau đó thêm các lớp: kiểm tra đầu vào (allow-list), tài khoản DB đặc quyền tối thiểu, thông báo lỗi chung chung và WAF. Trong đề thi, khi hỏi cách TỐT NHẤT hoặc sửa nguyên nhân gốc, ưu tiên sửa mã hơn biện pháp bù trừ.',
    },
    takeaway: {
      en: 'SQL injection → parameterized queries. WAF is a compensating layer, not the fix.',
      vi: 'SQL injection → truy vấn tham số hóa. WAF là lớp bù trừ, không phải cách sửa.',
    },
    concepts: ['SQL injection', 'parameterized queries', 'defence in depth'],
  },
  {
    id: 'vulnerable-dependency',
    domainId: 'd8',
    title: { en: 'A critical CVE in a library you did not write', vi: 'CVE nghiêm trọng trong thư viện bạn không viết' },
    situation: {
      en: 'A critical remote code execution CVE is published for a popular open-source logging library. It takes your team three days just to find which of 140 internal services include the library, some only as a dependency of a dependency.',
      vi: 'Một CVE thực thi mã từ xa nghiêm trọng được công bố cho một thư viện logging mã nguồn mở phổ biến. Đội của bạn mất ba ngày chỉ để tìm ra trong 140 dịch vụ nội bộ, dịch vụ nào có dùng thư viện này, có nơi chỉ dùng gián tiếp qua dependency của dependency.',
    },
    question: { en: 'Which control would MOST improve your response next time?', vi: 'Biện pháp nào cải thiện việc ứng phó lần sau NHIỀU NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Static application security testing (SAST) on your own code.', vi: 'Kiểm thử bảo mật tĩnh (SAST) trên mã nguồn của bạn.' },
        why: {
          en: 'SAST analyses the code you wrote. It is not designed to inventory third-party components and their versions.',
          vi: 'SAST phân tích mã do bạn viết. Nó không được thiết kế để kiểm kê thành phần bên thứ ba và phiên bản của chúng.',
        },
      },
      {
        id: 'B',
        text: { en: 'Software composition analysis in the CI pipeline and an SBOM for every service.', vi: 'Software composition analysis (SCA) trong pipeline CI và SBOM cho mỗi dịch vụ.' },
        why: {
          en: 'Correct. An SBOM lists every component, including transitive dependencies; SCA matches them against vulnerability databases and can block builds. Finding affected services becomes a query, not a three-day hunt.',
          vi: 'Đúng. SBOM liệt kê mọi thành phần, kể cả dependency gián tiếp; SCA đối chiếu với cơ sở dữ liệu lỗ hổng và có thể chặn build. Tìm dịch vụ bị ảnh hưởng chỉ còn là một câu truy vấn, không phải ba ngày tìm kiếm.',
        },
      },
      {
        id: 'C',
        text: { en: 'Code signing for all releases.', vi: 'Ký số mã nguồn cho mọi bản phát hành.' },
        why: {
          en: 'Code signing proves who published a build and that it was not altered. It says nothing about vulnerable components inside.',
          vi: 'Ký số chứng minh ai phát hành bản build và nó không bị sửa đổi. Nó không cho biết gì về các thành phần có lỗ hổng bên trong.',
        },
      },
      {
        id: 'D',
        text: { en: 'Ban open-source libraries.', vi: 'Cấm dùng thư viện mã nguồn mở.' },
        why: {
          en: 'Unrealistic and not risk-based. Commercial software has vulnerabilities too, and you would still need to track components.',
          vi: 'Không thực tế và không dựa trên rủi ro. Phần mềm thương mại cũng có lỗ hổng, và bạn vẫn cần theo dõi thành phần.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Third-party and open-source components are part of your attack surface and your software supply chain. Software composition analysis plus a software bill of materials gives you inventory and continuous vulnerability matching. Pair it with a patch process and a policy for acceptable licences and component age.',
      vi: 'Thành phần bên thứ ba và mã nguồn mở là một phần bề mặt tấn công và chuỗi cung ứng phần mềm của bạn. SCA cùng với SBOM (software bill of materials) cho bạn danh mục thành phần và đối chiếu lỗ hổng liên tục. Kết hợp với quy trình vá lỗi và chính sách về giấy phép, độ cũ của thành phần.',
    },
    takeaway: {
      en: 'Third-party component risk → SCA + SBOM. SAST is for your own code.',
      vi: 'Rủi ro thành phần bên thứ ba → SCA + SBOM. SAST dành cho mã của bạn.',
    },
    concepts: ['SCA', 'SBOM', 'supply chain'],
  },
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
