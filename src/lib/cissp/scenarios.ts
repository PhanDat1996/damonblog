// CISSP practice scenarios, written by DamonSec. Not ISC2 exam questions.
// Every scenario has four options, one answer, and a reason for each option in English and Vietnamese.

import type { Bi, DomainId } from './domains.ts';
import { MORE_SCENARIOS } from './scenarios-more.ts';
import { HARD_SCENARIOS } from './scenarios-hard.ts';

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
  /** 'hard': every option is plausible; the qualifier in the question decides. */
  level?: 'hard';
  /** Other domains a cross-domain scenario also tests. */
  alsoDomains?: DomainId[];
}

const CORE_SCENARIOS: Scenario[] = [
  // ── Domain 1: Security and Risk Management ───────────────────────────────
  {
    id: 'new-ciso-first-step',
    domainId: 'd1',
    title: { en: 'A new CISO at a hospital', vi: 'CISO mới về bệnh viện' },
    situation: {
      en: 'You have just joined a 600-bed hospital as its first CISO. There is no formal security program. The CIO wants you to "buy whatever we need", the board has asked for a plan within 90 days, and the network team has already sent you a list of 1,200 vulnerabilities from a recent scan.',
      vi: 'Bạn vừa về làm CISO đầu tiên của một bệnh viện 600 giường. Ở đây chưa có security program nào bài bản. CIO thì bảo "cần gì cứ mua", board muốn có kế hoạch trong 90 ngày, còn team network vừa gửi qua danh sách 1.200 lỗ hổng từ lần scan gần nhất.',
    },
    question: { en: 'What should you do FIRST?', vi: 'Bạn nên làm gì TRƯỚC TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Start patching the critical vulnerabilities from the scan.', vi: 'Bắt tay vá ngay các lỗ hổng critical trong kết quả scan.' },
        why: {
          en: 'Patching is a technical, tactical task. Without knowing which systems matter most to patient care, you cannot even prioritise the 1,200 findings correctly.',
          vi: 'Sai thứ tự. Patch là việc kỹ thuật, mang tính tác chiến. Chưa biết hệ thống nào quan trọng nhất cho việc chữa trị bệnh nhân thì bạn còn chẳng biết nên ưu tiên cái nào trong 1.200 lỗ hổng kia.',
        },
      },
      {
        id: 'B',
        text: { en: 'Write an information security policy and publish it to all staff.', vi: 'Viết policy bảo mật rồi ban hành cho toàn bộ nhân viên.' },
        why: {
          en: 'Policy is needed, but a policy written before you understand the business and have management backing will not reflect the organisation\'s goals and will not be enforced.',
          vi: 'Policy thì cần, nhưng viết khi chưa hiểu nghiệp vụ và chưa có ban lãnh đạo đứng ra bảo trợ thì policy sẽ không bám mục tiêu của tổ chức, mà cũng chẳng ai thực thi.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Meet senior management to understand business objectives and risk appetite, and get their sponsorship for the program.',
          vi: 'Ngồi với ban lãnh đạo để nắm mục tiêu kinh doanh, risk appetite, và xin họ đứng ra bảo trợ cho chương trình.',
        },
        why: {
          en: 'Correct. A security program exists to support the business. Senior management support and an understanding of objectives and risk appetite come before risk assessment, policy or tools.',
          vi: 'Đúng. Security program sinh ra để phục vụ việc kinh doanh. Phải có ban lãnh đạo ủng hộ, phải hiểu mục tiêu và risk appetite trước đã, rồi mới tới đánh giá risk, viết policy hay mua tool.',
        },
      },
      {
        id: 'D',
        text: { en: 'Buy a SIEM so you can see what is happening on the network.', vi: 'Mua SIEM để thấy được chuyện gì đang diễn ra trên mạng.' },
        why: {
          en: 'Buying technology before defining requirements is a classic wrong answer. A SIEM with no use cases, owners or staff produces noise, not security.',
          vi: 'Bẫy kinh điển: mua công nghệ trước khi xác định yêu cầu. SIEM mà không có use case, không có người chịu trách nhiệm, không có người vận hành thì chỉ sinh ra noise chứ không ra bảo mật.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'CISSP questions reward the manager\'s view. Governance starts top-down: align security with business goals, get senior management to own the program, then assess risk, then write policy, then choose controls. Every other option here is a valid activity, just not the first one.',
      vi: 'Đề CISSP chấm theo góc nhìn của người quản lý. Governance đi từ trên xuống: cho security khớp với mục tiêu kinh doanh, để ban lãnh đạo đứng ra làm chủ chương trình, rồi mới đánh giá risk, viết policy, chọn control. Các phương án còn lại đều là việc nên làm, chỉ là không phải việc đầu tiên.',
    },
    takeaway: {
      en: 'When asked what to do FIRST in a new program: business alignment and senior management support.',
      vi: 'Chương trình mới, hỏi làm gì TRƯỚC TIÊN: bám mục tiêu kinh doanh và có ban lãnh đạo đứng ra bảo trợ.',
    },
    concepts: ['governance', 'senior management', 'risk appetite'],
  },
  {
    id: 'ale-cost-justification',
    domainId: 'd1',
    title: { en: 'Is the flood control worth it?', vi: 'Chống lụt có đáng tiền không?' },
    situation: {
      en: 'A server room is valued at $500,000. A flood would damage about 40% of it. Flood records show one flood every 10 years in the area. A vendor offers flood barriers and sensors that cost $25,000 per year and would almost eliminate the risk.',
      vi: 'Phòng server trị giá $500.000. Nếu bị lụt thì khoảng 40% sẽ hư hại. Theo số liệu ở khu vực này, cứ 10 năm lại lụt một lần. Một vendor chào bộ rào chắn và cảm biến chống lụt giá $25.000 mỗi năm, gần như dập tắt hẳn risk này.',
    },
    question: {
      en: 'Based only on quantitative analysis, what should you recommend?',
      vi: 'Chỉ dựa vào phân tích định lượng, bạn nên đề xuất gì?',
    },
    options: [
      {
        id: 'A',
        text: { en: 'Buy it. The ALE is $200,000, far above the control cost.', vi: 'Mua. ALE là $200.000, cao hơn hẳn chi phí control.' },
        why: {
          en: '$200,000 is the SLE (500,000 × 0.4). It ignores the ARO of 0.1, so it overstates the yearly loss tenfold.',
          vi: 'Nhầm SLE với ALE. $200.000 là SLE (500.000 × 0,4). Con số này bỏ qua ARO 0,1 nên thổi tổn thất hằng năm lên gấp 10 lần.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Do not buy it on cost grounds. The ALE is $20,000, so the control costs more than the loss it prevents.',
          vi: 'Không mua, vì chi phí. ALE chỉ $20.000, control còn đắt hơn tổn thất nó ngăn được.',
        },
        why: {
          en: 'Correct. SLE = AV × EF = $500,000 × 0.4 = $200,000. ALE = SLE × ARO = $200,000 × 0.1 = $20,000. Even if the control removed all of the risk, the yearly benefit ($20,000) is less than its yearly cost ($25,000).',
          vi: 'Đúng. SLE = AV × EF = $500.000 × 0,4 = $200.000. ALE = SLE × ARO = $200.000 × 0,1 = $20.000. Kể cả control xóa sạch risk thì lợi ích mỗi năm ($20.000) vẫn thấp hơn chi phí mỗi năm ($25.000).',
        },
      },
      {
        id: 'C',
        text: { en: 'Buy it. Any control that reduces risk should be implemented.', vi: 'Mua. Control nào giảm được risk thì đều nên triển khai.' },
        why: {
          en: 'Controls must be cost-justified. Spending more than the value protected is not due care, it is waste.',
          vi: 'Không phải vậy. Control phải chứng minh được là đáng tiền. Chi nhiều hơn giá trị cần bảo vệ thì không phải due care, mà là lãng phí.',
        },
      },
      {
        id: 'D',
        text: { en: 'Do not buy it. The ARO is too low for floods to matter.', vi: 'Không mua. ARO thấp quá nên lụt chẳng đáng lo.' },
        why: {
          en: 'The conclusion happens to match, but the reasoning is wrong. A low ARO does not make a risk irrelevant; the decision comes from comparing ALE with the control cost.',
          vi: 'Kết luận trùng nhưng lập luận sai. ARO thấp không có nghĩa risk không đáng kể; quyết định phải đến từ phép so ALE với chi phí control.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Know the chain: Asset Value × Exposure Factor = Single Loss Expectancy; SLE × Annualized Rate of Occurrence = Annualized Loss Expectancy. Value of a safeguard = (ALE before − ALE after) − annual cost of the safeguard. Here: (20,000 − ~0) − 25,000 = −5,000, so it is not cost-justified. In practice you might still accept, transfer (insurance) or find a cheaper control. Exception to remember: when human safety is involved, cost is not the deciding factor.',
      vi: 'Nhớ chuỗi công thức: Asset Value × Exposure Factor = Single Loss Expectancy; SLE × Annualized Rate of Occurrence = Annualized Loss Expectancy. Giá trị của một safeguard = (ALE trước − ALE sau) − chi phí safeguard mỗi năm. Ở đây: (20.000 − ~0) − 25.000 = −5.000, nên không đáng tiền. Thực tế bạn vẫn có thể chấp nhận risk, chuyển risk đi (mua bảo hiểm) hoặc tìm control rẻ hơn. Ngoại lệ cần nhớ: đã dính tới an toàn tính mạng con người thì chi phí không còn là yếu tố quyết định.',
    },
    takeaway: {
      en: 'SLE = AV × EF. ALE = SLE × ARO. A control is justified only if the ALE reduction exceeds its annual cost.',
      vi: 'SLE = AV × EF. ALE = SLE × ARO. Control chỉ đáng tiền khi phần ALE giảm được lớn hơn chi phí mỗi năm của nó.',
    },
    concepts: ['quantitative risk analysis', 'SLE', 'ALE', 'ARO'],
  },
  {
    id: 'ethics-exam-content',
    domainId: 'd1',
    title: { en: 'A friend asks about your exam', vi: 'Bạn thân hỏi xin đề thi' },
    situation: {
      en: 'You passed the CISSP last month. A close friend who is booked for the exam next week messages you: "Can you send me the questions you remember? Just the hard ones. Nobody will know."',
      vi: 'Tháng trước bạn vừa đậu CISSP. Một người bạn thân đã đăng ký thi vào tuần sau nhắn cho bạn: "Gửi mình mấy câu bạn còn nhớ đi? Mấy câu khó thôi. Không ai biết đâu."',
    },
    question: { en: 'What is the BEST response?', vi: 'Cách trả lời nào TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Share the questions paraphrased in your own words.', vi: 'Gửi, nhưng diễn đạt lại bằng lời của mình.' },
        why: {
          en: 'Paraphrasing is still disclosing exam content. The candidate agreement covers the substance of questions, not just the exact wording.',
          vi: 'Đổi lời thì vẫn là tiết lộ nội dung đề. Thỏa thuận thí sinh áp dụng cho nội dung câu hỏi, chứ không chỉ cho câu chữ nguyên văn.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Decline, explain that exam content is covered by the non-disclosure agreement and the Code of Ethics, and point them to the official exam outline.',
          vi: 'Từ chối, giải thích rằng nội dung đề nằm trong NDA và Code of Ethics, rồi chỉ bạn ấy sang exam outline chính thức.',
        },
        why: {
          en: 'Correct. Disclosing exam content breaks the NDA you accepted and the canons to act honorably, honestly, justly, responsibly and legally, and to advance and protect the profession. The outline is public and fair to share.',
          vi: 'Đúng. Tiết lộ đề là vi phạm NDA bạn đã chấp nhận, và vi phạm các canon yêu cầu bạn hành động đàng hoàng, trung thực, công bằng, có trách nhiệm, đúng pháp luật, cũng như phát triển và bảo vệ nghề nghiệp. Còn exam outline là tài liệu công khai, cứ chia sẻ thoải mái.',
        },
      },
      {
        id: 'C',
        text: { en: 'Share them, because your friend is also an ISC2 candidate.', vi: 'Gửi, vì bạn ấy cũng là thí sinh của ISC2.' },
        why: {
          en: 'Being a candidate does not give anyone a right to exam content. This helps one person and damages the value of the credential for everyone.',
          vi: 'Là thí sinh không có nghĩa là được quyền xem đề. Giúp một người mà làm mất giá trị chứng chỉ của tất cả mọi người.',
        },
      },
      {
        id: 'D',
        text: { en: 'Post the questions anonymously on a forum so you are not personally involved.', vi: 'Đăng ẩn danh lên forum để mình không dính líu.' },
        why: {
          en: 'Anonymity changes the chance of being caught, not whether it is a breach. It also spreads the damage further.',
          vi: 'Ẩn danh chỉ làm giảm khả năng bị phát hiện, chứ vi phạm thì vẫn là vi phạm. Lại còn làm thiệt hại lan rộng hơn.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'The ISC2 Code of Ethics has four canons, applied in this order: (1) protect society, the common good, necessary public trust and confidence, and the infrastructure; (2) act honorably, honestly, justly, responsibly and legally; (3) provide diligent and competent service to principals; (4) advance and protect the profession. Exam-dump questions test canons 2 and 4. Members who knowingly help others break the code can lose their certification.',
      vi: 'Code of Ethics của ISC2 có bốn canon, xét theo đúng thứ tự: (1) bảo vệ xã hội, lợi ích chung, niềm tin của công chúng và hạ tầng; (2) hành động đàng hoàng, trung thực, công bằng, có trách nhiệm và đúng pháp luật; (3) phục vụ tận tâm, đủ năng lực cho những bên mình làm việc cho (principals); (4) phát triển và bảo vệ nghề nghiệp. Câu hỏi kiểu xin đề thi là đang test canon 2 và 4. Thành viên cố ý giúp người khác vi phạm code có thể bị tước chứng chỉ.',
    },
    takeaway: {
      en: 'Know the four canons and their order. Society first, profession last.',
      vi: 'Thuộc bốn canon và thứ tự của chúng. Xã hội đứng đầu, nghề nghiệp đứng cuối.',
    },
    concepts: ['ISC2 Code of Ethics', 'NDA'],
  },

  // ── Domain 2: Asset Security ─────────────────────────────────────────────
  {
    id: 'who-classifies-data',
    domainId: 'd2',
    title: { en: 'Who sets the classification?', vi: 'Ai quyết định classification?' },
    situation: {
      en: 'The sales department is launching a new CRM that stores customer contacts, contract values and pricing discounts. The DBA who is building the database asks you, the security manager, which classification label to apply so they can configure encryption and access.',
      vi: 'Phòng sales sắp đưa vào dùng một CRM mới, lưu thông tin liên hệ khách hàng, giá trị hợp đồng và mức chiết khấu. DBA đang dựng database hỏi bạn, security manager, nên gắn nhãn classification nào để họ còn cấu hình mã hóa và phân quyền.',
    },
    question: { en: 'Who should decide the classification?', vi: 'Ai nên là người quyết định classification?' },
    options: [
      {
        id: 'A',
        text: { en: 'The DBA, because they manage the data every day.', vi: 'DBA, vì ngày nào họ cũng quản lý dữ liệu này.' },
        why: {
          en: 'The DBA is the data custodian: they implement and maintain the protection that someone else decides on.',
          vi: 'Không phải. DBA là data custodian: họ triển khai và duy trì các biện pháp bảo vệ do người khác quyết định.',
        },
      },
      {
        id: 'B',
        text: { en: 'You, the security manager.', vi: 'Bạn, security manager.' },
        why: {
          en: 'Security defines the classification scheme and advises, but does not own business data. Taking the decision moves accountability to the wrong place.',
          vi: 'Nghe hợp lý nhưng sai. Security đưa ra classification scheme và tư vấn, chứ không sở hữu dữ liệu kinh doanh. Bạn mà quyết thì trách nhiệm bị dồn sai chỗ.',
        },
      },
      {
        id: 'C',
        text: { en: 'The head of sales, as the data owner.', vi: 'Trưởng phòng sales, vì đó là data owner.' },
        why: {
          en: 'Correct. The data owner is a senior business manager who is accountable for the data, decides its classification and approves who gets access.',
          vi: 'Đúng. Data owner là quản lý cấp cao phía kinh doanh, chịu trách nhiệm về dữ liệu, quyết định classification và duyệt ai được truy cập.',
        },
      },
      {
        id: 'D',
        text: { en: 'The CRM vendor, based on their default settings.', vi: 'Vendor CRM, theo cấu hình mặc định của họ.' },
        why: {
          en: 'A vendor does not know the value of your data to your business and carries none of the accountability.',
          vi: 'Vendor không biết dữ liệu này có giá trị thế nào với công ty bạn, và cũng chẳng chịu trách nhiệm gì.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Separate the roles: the data owner (business, accountable) classifies and approves access; the data custodian (IT/DBA) implements controls such as backups and encryption; the security team writes the scheme and advises; users follow the rules. On the exam, "accountable" points to the owner and "day-to-day protection" points to the custodian.',
      vi: 'Tách bạch các vai trò: data owner (phía kinh doanh, chịu trách nhiệm) phân loại dữ liệu và duyệt quyền truy cập; data custodian (IT/DBA) triển khai control như backup, mã hóa; team security viết scheme và tư vấn; user thì tuân thủ quy định. Trong đề thi, thấy "accountable" thì nghĩ tới owner, thấy "day-to-day protection" thì nghĩ tới custodian.',
    },
    takeaway: {
      en: 'Owner classifies and is accountable. Custodian implements.',
      vi: 'Owner phân loại và chịu trách nhiệm. Custodian triển khai.',
    },
    concepts: ['data owner', 'data custodian', 'classification'],
  },
  {
    id: 'ssd-sanitization',
    domainId: 'd2',
    title: { en: 'Donating old SSD laptops', vi: 'Tặng laptop SSD cũ' },
    situation: {
      en: 'Your company wants to donate 200 retired laptops to a local school. The laptops have self-encrypting SSDs that held confidential HR and finance files. Management wants the drives to stay in the laptops so they are usable.',
      vi: 'Công ty muốn tặng 200 laptop đã thanh lý cho một trường học gần đó. Máy dùng SSD tự mã hóa (self-encrypting), từng chứa file mật của HR và tài chính. Ban lãnh đạo muốn giữ nguyên ổ trong máy để trường còn dùng được.',
    },
    question: { en: 'Which method is MOST appropriate?', vi: 'Cách nào PHÙ HỢP NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Degauss each drive.', vi: 'Degauss từng ổ.' },
        why: {
          en: 'Degaussing works on magnetic media. SSDs store data in flash cells, so a degausser does not reliably erase them, and it may destroy the drive anyway.',
          vi: 'Sai loại media. Degauss chỉ có tác dụng với media từ tính. SSD lưu dữ liệu trong cell flash nên degausser không xóa chắc chắn được, mà còn có thể làm hỏng luôn ổ.',
        },
      },
      {
        id: 'B',
        text: { en: 'Overwrite every sector three times with zeros.', vi: 'Ghi đè toàn bộ sector bằng số 0, ba lần.' },
        why: {
          en: 'Wear levelling and over-provisioning mean the OS cannot address every flash cell, so overwriting can leave old data behind.',
          vi: 'Chưa đủ. Vì wear leveling và over-provisioning, OS không chạm được tới mọi cell flash, nên ghi đè vẫn có thể sót dữ liệu cũ.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Purge with cryptographic erase (destroy the drive\'s media encryption key), then verify and document it.',
          vi: 'Purge bằng crypto erase (hủy media encryption key của ổ), rồi verify và lưu hồ sơ.',
        },
        why: {
          en: 'Correct. On a self-encrypting drive, destroying the media encryption key makes all stored data unreadable while leaving the drive reusable. NIST SP 800-88 lists cryptographic erase as a purge method. Verification and records prove it was done.',
          vi: 'Đúng. Với ổ tự mã hóa, hủy media encryption key là toàn bộ dữ liệu trên ổ không đọc được nữa, còn ổ vẫn dùng lại được. NIST SP 800-88 xếp cryptographic erase vào nhóm purge. Verify và lưu hồ sơ để chứng minh là đã làm.',
        },
      },
      {
        id: 'D',
        text: { en: 'Delete the partitions and reinstall the OS.', vi: 'Xóa partition rồi cài lại OS.' },
        why: {
          en: 'Deleting and formatting only remove pointers. Recovery tools can bring most of the data back. This is not even "clear" level sanitization.',
          vi: 'Xóa và format chỉ gỡ con trỏ, tool khôi phục vẫn lấy lại được phần lớn dữ liệu. Mức này còn chưa tới "clear".',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'NIST SP 800-88 defines three levels: Clear (logical overwrite, protects against simple recovery), Purge (protects against lab recovery: cryptographic erase, block erase, degauss for magnetic media), and Destroy (shred, pulverise, incinerate). The data is confidential and the media leaves your control, so you need at least Purge. Because the drives must stay usable, Destroy is out, and cryptographic erase fits SSDs.',
      vi: 'NIST SP 800-88 chia ba mức: Clear (ghi đè logic, chống khôi phục đơn giản), Purge (chống khôi phục cấp phòng lab: cryptographic erase, block erase, degauss với media từ), và Destroy (cắt vụn, nghiền, đốt). Dữ liệu mật mà ổ lại ra khỏi tầm kiểm soát của bạn thì tối thiểu phải Purge. Ổ còn phải dùng được nên loại Destroy, và với SSD thì cryptographic erase là hợp nhất.',
    },
    takeaway: {
      en: 'SSD + reuse → purge via cryptographic or vendor secure erase. Degaussing is for magnetic media only.',
      vi: 'SSD + dùng lại → purge bằng crypto erase hoặc secure erase của hãng. Degauss chỉ dành cho media từ.',
    },
    concepts: ['data remanence', 'NIST SP 800-88', 'crypto erase'],
  },
  {
    id: 'legal-hold-vs-retention',
    domainId: 'd2',
    title: { en: 'Retention schedule meets a lawsuit', vi: 'Retention schedule đụng vụ kiện' },
    situation: {
      en: 'Your retention policy says email older than two years is deleted automatically every Sunday. On Thursday, legal counsel tells you the company is being sued by a former supplier and issues a litigation hold on all communication with that supplier since 2021.',
      vi: 'Theo retention policy, email cũ hơn hai năm tự động bị xóa vào mỗi Chủ nhật. Hôm thứ Năm, legal báo công ty đang bị một nhà cung cấp cũ kiện, và ra litigation hold cho toàn bộ trao đổi với nhà cung cấp này từ năm 2021 tới nay.',
    },
    question: { en: 'What should you do?', vi: 'Bạn nên làm gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Let Sunday\'s job run. The retention policy was approved by management.', vi: 'Cứ để job Chủ nhật chạy. Ban lãnh đạo đã duyệt retention policy rồi.' },
        why: {
          en: 'Once litigation is expected, destroying relevant records is spoliation of evidence, even under an approved schedule. Courts can sanction the company.',
          vi: 'Nguy hiểm. Đã thấy trước sẽ có kiện tụng mà hủy hồ sơ liên quan là tiêu hủy chứng cứ (spoliation), dù có làm đúng lịch đã duyệt. Tòa có thể phạt công ty.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Suspend deletion for the records covered by the hold, preserve them, and confirm with legal when the hold is lifted.',
          vi: 'Tạm dừng xóa với dữ liệu thuộc phạm vi hold, giữ nguyên chúng, và xác nhận với legal khi nào hold được gỡ.',
        },
        why: {
          en: 'Correct. A legal hold overrides normal retention for the data in scope. Preserve it, keep the rest of the schedule running, and resume deletion only when legal releases the hold.',
          vi: 'Đúng. Legal hold đè lên retention thông thường, nhưng chỉ với dữ liệu trong phạm vi. Giữ nguyên phần đó, phần còn lại của lịch vẫn chạy, và chỉ xóa tiếp khi legal gỡ hold.',
        },
      },
      {
        id: 'C',
        text: { en: 'Stop all deletion across the company indefinitely.', vi: 'Dừng toàn bộ việc xóa trong công ty, vô thời hạn.' },
        why: {
          en: 'Over-preserving increases storage cost, privacy exposure and discovery burden. The hold has a defined scope.',
          vi: 'Quá tay. Giữ thừa thì tốn storage, tăng rủi ro privacy và nặng thêm gánh discovery. Hold có phạm vi rõ ràng.',
        },
      },
      {
        id: 'D',
        text: { en: 'Export the supplier emails to your own laptop as a backup.', vi: 'Export email với nhà cung cấp đó về laptop của bạn làm backup.' },
        why: {
          en: 'Copying evidence to an uncontrolled device breaks integrity and chain of custody and creates a new data-protection risk.',
          vi: 'Chép evidence sang thiết bị không kiểm soát là phá integrity và chain of custody, lại sinh thêm risk về bảo vệ dữ liệu.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Retention policies define how long data is kept and when it is destroyed, but legal obligations come first. A litigation hold suspends destruction only for the relevant data until legal counsel releases it. Security\'s job is to make the hold technically effective and keep the data\'s integrity.',
      vi: 'Retention policy quy định dữ liệu giữ bao lâu và khi nào hủy, nhưng nghĩa vụ pháp lý luôn đứng trên. Litigation hold chỉ tạm dừng hủy với dữ liệu liên quan, cho tới khi legal gỡ hold. Phần của security là làm cho hold có hiệu lực thật về mặt kỹ thuật và giữ integrity của dữ liệu.',
    },
    takeaway: {
      en: 'Legal hold beats retention schedule, for the data in scope only.',
      vi: 'Legal hold thắng retention schedule, nhưng chỉ với dữ liệu trong phạm vi.',
    },
    concepts: ['data retention', 'legal hold', 'e-discovery'],
  },

  // ── Domain 3: Security Architecture and Engineering ──────────────────────
  {
    id: 'bell-lapadula-write-down',
    domainId: 'd3',
    title: { en: 'Blocked from saving a report', vi: 'Không lưu được báo cáo' },
    situation: {
      en: 'An analyst with a Secret clearance is logged in at the Secret level. She tries to save a summary report to a share labelled Unclassified so a wider team can read it. The trusted operating system blocks the save, although she can still read Unclassified files.',
      vi: 'Một analyst có clearance Secret đang đăng nhập ở mức Secret. Chị muốn lưu bản báo cáo tóm tắt vào thư mục share gắn nhãn Unclassified cho team rộng hơn đọc. Hệ điều hành trusted chặn không cho lưu, dù chị vẫn đọc file Unclassified bình thường.',
    },
    question: { en: 'Which rule is the system enforcing?', vi: 'Hệ thống đang áp quy tắc nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Biba integrity star property (no write up).', vi: 'Biba integrity star property (no write up).' },
        why: {
          en: 'Biba protects integrity and would block writing to a HIGHER integrity level, not a lower one.',
          vi: 'Nhầm mô hình. Biba lo về integrity, nó chặn ghi lên mức integrity CAO HƠN chứ không chặn ghi xuống mức thấp hơn.',
        },
      },
      {
        id: 'B',
        text: { en: 'Bell-LaPadula star (*) property (no write down).', vi: 'Bell-LaPadula star (*) property (no write down).' },
        why: {
          en: 'Correct. Bell-LaPadula protects confidentiality. The * property stops a subject from writing to a lower classification, which could leak Secret data to Unclassified readers.',
          vi: 'Đúng. Bell-LaPadula lo về confidentiality. Star property không cho subject ghi xuống mức classification thấp hơn, vì làm vậy là có thể đẩy dữ liệu Secret tới người đọc Unclassified.',
        },
      },
      {
        id: 'C',
        text: { en: 'Bell-LaPadula simple security property (no read up).', vi: 'Bell-LaPadula simple security property (no read up).' },
        why: {
          en: 'Right model, wrong rule. The simple property controls reading higher levels; here the action is writing to a lower one.',
          vi: 'Đúng mô hình nhưng sai quy tắc. Simple property quản chuyện đọc lên mức cao hơn, còn ở đây chị ấy đang ghi xuống mức thấp hơn.',
        },
      },
      {
        id: 'D',
        text: { en: 'Brewer-Nash (Chinese Wall).', vi: 'Brewer-Nash (Chinese Wall).' },
        why: {
          en: 'Brewer-Nash prevents conflicts of interest by blocking access to a competitor\'s data after you have accessed a client\'s. It does not use classification levels.',
          vi: 'Không liên quan. Brewer-Nash chống xung đột lợi ích: đã đụng vào dữ liệu của một khách hàng thì bị chặn truy cập dữ liệu của đối thủ họ. Mô hình này không dùng mức classification.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Bell-LaPadula (confidentiality): no read up (simple security), no write down (* property), and the strong star property (read and write only at your own level). Biba (integrity) is the mirror: no read down, no write up. Memory aid: "BLP keeps secrets in, Biba keeps dirt out."',
      vi: 'Bell-LaPadula (confidentiality): no read up (simple security), no write down (star property), còn strong star property thì chỉ cho đọc và ghi đúng ở mức của mình. Biba (integrity) thì ngược lại: no read down, no write up. Mẹo nhớ: "BLP giữ bí mật không lọt ra, Biba giữ rác không lọt vào."',
    },
    takeaway: {
      en: 'BLP = confidentiality: no read up, no write down. Biba = integrity: no read down, no write up.',
      vi: 'BLP lo bí mật: no read up, no write down. Biba lo toàn vẹn: no read down, no write up.',
    },
    concepts: ['Bell-LaPadula', 'Biba', 'MAC'],
  },
  {
    id: 'hybrid-crypto-sign-encrypt',
    domainId: 'd3',
    title: { en: 'Sending a 4 GB contract securely', vi: 'Gửi bộ hợp đồng 4 GB cho an toàn' },
    situation: {
      en: 'Legal needs to send a 4 GB set of contract scans to an external law firm over the internet. The law firm must be sure the files came from your company and were not altered, and nobody else should be able to read them. Both sides have public/private key pairs.',
      vi: 'Bên pháp chế cần gửi bộ scan hợp đồng 4 GB cho một công ty luật bên ngoài qua internet. Bên luật phải chắc file đúng là từ công ty bạn gửi và không bị sửa, còn ngoài họ ra thì không ai được đọc. Hai bên đều đã có cặp public/private key.',
    },
    question: { en: 'Which approach meets all the requirements MOST efficiently?', vi: 'Cách nào đáp ứng đủ các yêu cầu mà HIỆU QUẢ NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Encrypt the files with your company\'s private key.', vi: 'Mã hóa file bằng private key của công ty bạn.' },
        why: {
          en: 'Anyone with your public key, which is public, can decrypt it. This proves origin but gives no confidentiality.',
          vi: 'Không bí mật gì cả. Public key của bạn ai cũng có nên ai cũng giải mã được. Cách này chỉ chứng minh được nguồn gốc.',
        },
      },
      {
        id: 'B',
        text: { en: 'Encrypt the whole 4 GB directly with the law firm\'s public key.', vi: 'Mã hóa thẳng cả 4 GB bằng public key của công ty luật.' },
        why: {
          en: 'Gives confidentiality only, with no proof of origin or integrity, and asymmetric encryption of bulk data is very slow.',
          vi: 'Thiếu và chậm. Chỉ có confidentiality, không chứng minh được nguồn gốc hay integrity, mà mã hóa bất đối xứng cho dữ liệu lớn thì rất chậm.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Sign a hash of the files with your private key, encrypt the files with a random AES session key, and encrypt that key with the law firm\'s public key.',
          vi: 'Ký hash của file bằng private key của bạn, mã hóa file bằng một AES session key ngẫu nhiên, rồi mã hóa session key đó bằng public key của công ty luật.',
        },
        why: {
          en: 'Correct. The digital signature gives integrity, authenticity and non-repudiation; symmetric AES handles bulk data fast; the recipient\'s public key protects the session key so only they can open it.',
          vi: 'Đúng. Chữ ký số lo phần integrity, authenticity và non-repudiation. AES đối xứng xử lý dữ liệu lớn nhanh. Public key của bên nhận bảo vệ session key nên chỉ họ mở được.',
        },
      },
      {
        id: 'D',
        text: { en: 'Send the files with a SHA-256 hash in the same email.', vi: 'Gửi file kèm hash SHA-256 trong cùng email.' },
        why: {
          en: 'An attacker who changes the files can also replace the hash. A bare hash gives no confidentiality and no authenticity.',
          vi: 'Hash trần thì vô dụng ở đây. Attacker sửa được file thì cũng thay luôn được hash, mà hash cũng chẳng giữ bí mật hay chứng minh nguồn gốc gì.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Match each goal to a key: confidentiality → encrypt with the RECIPIENT\'s public key (or a session key protected by it); authenticity and non-repudiation → sign with the SENDER\'s private key; integrity → hash, protected by the signature. Real systems (TLS, PGP, S/MIME) are hybrid: asymmetric for key exchange and signatures, symmetric for bulk data.',
      vi: 'Mỗi mục tiêu đi với một khóa: confidentiality → mã hóa bằng public key của NGƯỜI NHẬN (hoặc bằng session key được key đó bảo vệ); authenticity và non-repudiation → ký bằng private key của NGƯỜI GỬI; integrity → hash, có chữ ký bảo vệ. Hệ thống thực tế (TLS, PGP, S/MIME) đều chạy hybrid: bất đối xứng để trao đổi khóa và ký, đối xứng để mã hóa dữ liệu lớn.',
    },
    takeaway: {
      en: 'Confidentiality: recipient\'s public key. Non-repudiation: sender\'s private key. Bulk data: symmetric.',
      vi: 'Bí mật: public key người nhận. Chống chối bỏ: private key người gửi. Dữ liệu lớn: dùng đối xứng.',
    },
    concepts: ['hybrid cryptography', 'digital signature', 'non-repudiation'],
  },
  {
    id: 'fail-safe-door',
    domainId: 'd3',
    title: { en: 'The server room door in a fire', vi: 'Cửa phòng server khi có cháy' },
    situation: {
      en: 'You are designing access control for a new server room. The door uses an electromagnetic lock and a badge reader. The facilities manager asks how the door should behave if the fire alarm triggers and building power fails while two engineers are inside.',
      vi: 'Bạn đang thiết kế access control cho phòng server mới. Cửa dùng khóa điện từ và đầu đọc thẻ. Quản lý tòa nhà hỏi: nếu chuông báo cháy kêu và tòa nhà mất điện trong lúc có hai kỹ sư đang ở trong, thì cửa sẽ phản ứng ra sao?',
    },
    question: { en: 'How should the door be configured?', vi: 'Nên cấu hình cửa thế nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Fail-secure: stay locked to protect the equipment.', vi: 'Fail-secure: giữ khóa để bảo vệ thiết bị.' },
        why: {
          en: 'This can trap people inside during a fire. Protecting assets never outranks protecting people.',
          vi: 'Sai ưu tiên. Cháy mà cửa vẫn khóa thì có thể nhốt người ở trong. Bảo vệ tài sản không bao giờ xếp trên bảo vệ con người.',
        },
      },
      {
        id: 'B',
        text: { en: 'Fail-safe: unlock so people can get out, with alarms and CCTV to detect misuse.', vi: 'Fail-safe: mở khóa cho người thoát ra, có alarm và CCTV để phát hiện lạm dụng.' },
        why: {
          en: 'Correct. Human safety is always the first priority. Compensating controls such as door alarms, cameras and a guard response cover the asset risk during the event.',
          vi: 'Đúng. An toàn con người luôn đứng đầu. Rủi ro về tài sản trong lúc sự cố thì để compensating control lo: alarm cửa, camera, bảo vệ xuống kiểm tra.',
        },
      },
      {
        id: 'C',
        text: { en: 'Require a badge to exit, powered by a UPS.', vi: 'Bắt quẹt thẻ mới ra được, đầu đọc chạy bằng UPS.' },
        why: {
          en: 'A UPS can fail or run out, and badge-to-exit still delays escape. Egress must not depend on an authentication system during an emergency.',
          vi: 'Vẫn nguy hiểm. UPS có thể hỏng hoặc cạn pin, mà phải quẹt thẻ thì vẫn làm chậm lúc thoát. Lúc khẩn cấp, lối thoát không được phụ thuộc vào hệ thống xác thực.',
        },
      },
      {
        id: 'D',
        text: { en: 'Let the security manager decide remotely when the alarm fires.', vi: 'Để quản lý security quyết định từ xa khi chuông kêu.' },
        why: {
          en: 'A manual remote decision adds delay and a single point of failure exactly when time matters most.',
          vi: 'Nghe có vẻ kiểm soát tốt nhưng lại thêm độ trễ và một single point of failure đúng vào lúc từng giây đều quan trọng.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Fail-safe means the system fails in a state that protects people (door unlocks). Fail-secure means it fails in a state that protects assets (door stays locked). When people are at risk, CISSP always picks human safety first, then adds compensating controls for the assets. Check local fire and building codes, which usually require free egress.',
      vi: 'Fail-safe là khi lỗi thì hệ thống rơi về trạng thái bảo vệ con người (cửa mở). Fail-secure là rơi về trạng thái bảo vệ tài sản (cửa vẫn khóa). Hễ có người gặp nguy, CISSP luôn chọn an toàn con người trước rồi mới bổ sung compensating control cho tài sản. Nhớ kiểm tra quy chuẩn PCCC và xây dựng ở địa phương, thường họ bắt lối thoát phải luôn mở được.',
    },
    takeaway: {
      en: 'If any option endangers people, it is wrong. Human life comes first.',
      vi: 'Đáp án nào đặt người vào nguy hiểm là sai. Tính mạng con người luôn đứng đầu.',
    },
    concepts: ['fail-safe', 'fail-secure', 'life safety'],
  },

  // ── Domain 4: Communication and Network Security ─────────────────────────
  {
    id: 'wifi-shared-psk',
    domainId: 'd4',
    title: { en: 'One Wi-Fi password for everyone', vi: 'Cả công ty xài chung một mật khẩu Wi-Fi' },
    situation: {
      en: 'A branch office of 80 staff uses WPA2-Personal with one shared passphrase. Staff turnover is high, the passphrase has not changed in three years, and an audit found that two former employees still connect from the car park.',
      vi: 'Một chi nhánh 80 người dùng WPA2-Personal với một passphrase chung. Nhân sự ra vào liên tục, passphrase ba năm nay chưa đổi, và đợt audit vừa rồi phát hiện hai nhân viên cũ vẫn ngồi ngoài bãi xe kết nối vào được.',
    },
    question: { en: 'What is the BEST long-term fix?', vi: 'Hướng xử lý lâu dài TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Change the passphrase every time someone leaves.', vi: 'Đổi passphrase mỗi khi có người nghỉ việc.' },
        why: {
          en: 'Better than nothing, but it disrupts everyone, the new key is shared again immediately, and you still cannot tell users apart.',
          vi: 'Còn hơn không, nhưng lần nào đổi cũng ảnh hưởng cả chi nhánh, key mới lại bị share đi ngay, và vẫn không biết ai là ai.',
        },
      },
      {
        id: 'B',
        text: { en: 'Hide the SSID and enable MAC address filtering.', vi: 'Ẩn SSID và bật lọc MAC address.' },
        why: {
          en: 'Hidden SSIDs are visible in probe traffic and MAC addresses are easy to spoof. This is obscurity, not access control.',
          vi: 'Chỉ là che giấu, không phải access control. SSID ẩn vẫn lộ trong probe traffic, còn MAC address thì giả mạo dễ ợt.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Move to WPA3-Enterprise (802.1X) with a RADIUS server tied to the corporate directory.',
          vi: 'Chuyển sang WPA3-Enterprise (802.1X) với RADIUS server nối vào directory của công ty.',
        },
        why: {
          en: 'Correct. Each user authenticates with their own credentials or certificate. Disabling the directory account at termination removes Wi-Fi access too, and logs show who connected.',
          vi: 'Đúng. Mỗi người xác thực bằng credential hoặc certificate riêng. Nghỉ việc thì disable account trong directory là mất luôn Wi-Fi, và log cho biết ai đã kết nối.',
        },
      },
      {
        id: 'D',
        text: { en: 'Reduce the access points\' transmit power so the signal does not reach the car park.', vi: 'Giảm công suất phát của access point để sóng không ra tới bãi xe.' },
        why: {
          en: 'A directional antenna defeats this, and the real problem, shared credentials that cannot be revoked, is unchanged.',
          vi: 'Một cái ăng-ten định hướng là vượt qua được. Mà vấn đề thật là credential dùng chung, không thu hồi được, thì vẫn y nguyên.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'The root cause is a shared secret that gives no individual accountability. Enterprise mode with 802.1X/EAP and RADIUS gives per-user authentication, central revocation, per-session keys and auditing. On CISSP, prefer the answer that fixes the root cause with identity-based access over cosmetic measures.',
      vi: 'Nguyên nhân gốc là một secret dùng chung nên không quy được trách nhiệm cho từng người. Chế độ Enterprise với 802.1X/EAP và RADIUS cho bạn xác thực từng user, thu hồi tập trung, key riêng cho từng session và có log để audit. Đi thi CISSP thì chọn đáp án xử lý tận gốc bằng truy cập dựa trên identity, đừng chọn mấy biện pháp làm cho có.',
    },
    takeaway: {
      en: 'Shared secrets break accountability. Fix with per-user authentication (802.1X).',
      vi: 'Secret dùng chung là mất accountability. Sửa bằng xác thực từng user (802.1X).',
    },
    concepts: ['802.1X', 'WPA3', 'RADIUS', 'accountability'],
  },
  {
    id: 'ot-network-segmentation',
    domainId: 'd4',
    title: { en: 'Factory PLCs on the office LAN', vi: 'PLC nhà máy nằm chung LAN văn phòng' },
    situation: {
      en: 'A manufacturing plant\'s PLCs and HMIs sit on the same flat network as office PCs. The PLCs run firmware that cannot be patched without a production shutdown, and the vendor does not support antivirus on them. A phishing email recently infected an office PC.',
      vi: 'Ở một nhà máy, PLC và HMI đang nằm chung mạng phẳng với máy tính văn phòng. Firmware PLC muốn patch thì phải dừng dây chuyền, còn vendor thì không hỗ trợ cài antivirus lên đó. Mới đây một email phishing vừa làm nhiễm một máy văn phòng.',
    },
    question: { en: 'What should be done FIRST to reduce risk to the PLCs?', vi: 'Nên làm gì TRƯỚC TIÊN để giảm risk cho PLC?' },
    options: [
      {
        id: 'A',
        text: {
          en: 'Segment the OT network from IT with a firewall and an industrial DMZ, allowing only the specific flows that are needed.',
          vi: 'Tách mạng OT khỏi IT bằng firewall và một industrial DMZ, chỉ mở đúng những luồng thật sự cần.',
        },
        why: {
          en: 'Correct. When systems cannot be patched or run endpoint agents, network isolation is the main compensating control. It contains threats coming from the IT side.',
          vi: 'Đúng. Thiết bị không patch được, không cài agent được thì cô lập mạng là compensating control chính. Nó chặn mối đe dọa từ phía IT lan sang.',
        },
      },
      {
        id: 'B',
        text: { en: 'Schedule an emergency shutdown to patch all PLC firmware.', vi: 'Lên lịch dừng khẩn cấp để patch toàn bộ firmware PLC.' },
        why: {
          en: 'Unplanned downtime is a large business impact, and patching does not stop the next unpatched flaw from being reachable. In OT, availability and safety come first.',
          vi: 'Sai thứ tự. Dừng máy ngoài kế hoạch là thiệt hại lớn cho sản xuất, mà patch xong thì lỗ hổng chưa vá tiếp theo vẫn bị với tới như thường. Với OT, availability và safety đi trước.',
        },
      },
      {
        id: 'C',
        text: { en: 'Install antivirus on the PLCs anyway.', vi: 'Cứ cài antivirus lên PLC.' },
        why: {
          en: 'Unsupported software on controllers can cause crashes or unsafe behaviour and may void vendor support.',
          vi: 'Cài phần mềm không được hỗ trợ lên controller có thể gây treo, chạy sai gây mất an toàn, và có thể mất luôn hỗ trợ từ vendor.',
        },
      },
      {
        id: 'D',
        text: { en: 'Give engineers VPN access so they can manage PLCs from home.', vi: 'Cấp VPN để kỹ sư quản lý PLC từ nhà.' },
        why: {
          en: 'This adds a new remote attack path to the most sensitive systems instead of reducing exposure.',
          vi: 'Làm vậy là mở thêm một đường tấn công từ xa vào đúng hệ thống nhạy cảm nhất, chứ không giảm exposure chút nào.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Industrial control systems prioritise safety and availability, and many cannot be patched quickly. The standard approach (ISA/IEC 62443 zones and conduits, the Purdue model) is to segment OT into zones, put an industrial DMZ between IT and OT, and allow only required, monitored conduits. Segmentation limits lateral movement from compromised office machines.',
      vi: 'Hệ thống điều khiển công nghiệp đặt safety và availability lên đầu, và nhiều thiết bị không thể patch nhanh. Cách làm chuẩn (zones và conduits theo ISA/IEC 62443, mô hình Purdue) là chia OT thành các zone, đặt industrial DMZ giữa IT và OT, và chỉ cho phép những conduit cần thiết, có giám sát. Segmentation hạn chế lateral movement từ máy văn phòng đã bị chiếm.',
    },
    takeaway: {
      en: 'Cannot patch? Isolate. Segmentation is the compensating control for legacy and OT systems.',
      vi: 'Không patch được thì cô lập. Segmentation là compensating control cho hệ thống cũ và OT.',
    },
    concepts: ['segmentation', 'ICS/OT', 'Purdue model', 'compensating control'],
  },
  {
    id: 'ipsec-site-to-site',
    domainId: 'd4',
    title: { en: 'Choosing an IPsec mode', vi: 'Chọn mode IPsec' },
    situation: {
      en: 'Two offices will be connected over the internet by a VPN between their edge firewalls. Traffic between internal hosts must be encrypted, and the internal IP addressing should not be visible on the internet. Both firewalls sit behind NAT devices from the ISP.',
      vi: 'Hai văn phòng sẽ nối với nhau qua internet bằng VPN giữa hai firewall biên. Traffic giữa các máy nội bộ phải được mã hóa, và dải IP nội bộ không được lộ ra internet. Cả hai firewall đều nằm sau thiết bị NAT của ISP.',
    },
    question: { en: 'Which configuration fits BEST?', vi: 'Cấu hình nào PHÙ HỢP NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'AH in transport mode.', vi: 'AH ở transport mode.' },
        why: {
          en: 'AH provides integrity and authentication but no encryption, and it breaks through NAT because it authenticates the IP header.',
          vi: 'AH có integrity và xác thực nhưng không mã hóa. Nó còn không đi qua NAT được vì xác thực luôn cả IP header.',
        },
      },
      {
        id: 'B',
        text: { en: 'ESP in transport mode.', vi: 'ESP ở transport mode.' },
        why: {
          en: 'Transport mode protects only the payload and keeps the original IP header, so internal addressing is exposed. It is meant for host-to-host use.',
          vi: 'Mới đúng một nửa. Transport mode chỉ bảo vệ payload và giữ nguyên IP header gốc nên địa chỉ nội bộ vẫn lộ. Mode này dành cho host-to-host.',
        },
      },
      {
        id: 'C',
        text: { en: 'ESP in tunnel mode with NAT traversal (UDP 4500).', vi: 'ESP ở tunnel mode, có NAT traversal (UDP 4500).' },
        why: {
          en: 'Correct. Tunnel mode encrypts the whole original packet, including internal IP headers, inside a new outer header between the gateways. NAT-T wraps ESP in UDP so it passes NAT.',
          vi: 'Đúng. Tunnel mode mã hóa cả gói tin gốc, gồm luôn IP header nội bộ, rồi bọc trong một header mới giữa hai gateway. NAT-T bọc ESP trong UDP để đi qua NAT.',
        },
      },
      {
        id: 'D',
        text: { en: 'AH in tunnel mode.', vi: 'AH ở tunnel mode.' },
        why: {
          en: 'Still no confidentiality, because AH never encrypts.',
          vi: 'Đổi mode cũng vậy thôi: AH không bao giờ mã hóa nên vẫn không có confidentiality.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'IPsec has two protocols and two modes. AH = integrity + origin authentication, no encryption. ESP = confidentiality, plus integrity and authentication. Transport mode protects the payload (host-to-host). Tunnel mode wraps the whole packet (gateway-to-gateway, site-to-site VPN). IKE negotiates the security associations.',
      vi: 'IPsec có hai protocol và hai mode. AH = integrity + xác thực nguồn gốc, không mã hóa. ESP = confidentiality, kèm integrity và xác thực. Transport mode bảo vệ payload (host-to-host). Tunnel mode bọc cả gói tin (gateway-to-gateway, VPN site-to-site). IKE lo thương lượng các security association.',
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
    title: { en: 'A tense termination', vi: 'Cho nghỉ việc trong căng thẳng' },
    situation: {
      en: 'HR tells you that a senior system administrator will be dismissed at 10:00 tomorrow for misconduct. He has domain admin rights, VPN access and the root password to several appliances. HR expects him to react badly.',
      vi: 'HR báo 10:00 sáng mai sẽ cho một sysadmin senior nghỉ việc vì vi phạm kỷ luật. Anh này đang có quyền domain admin, VPN và cả password root của mấy thiết bị. HR đoán là anh ấy sẽ phản ứng không hay.',
    },
    question: { en: 'When should his access be removed?', vi: 'Khi nào thì nên cắt quyền truy cập của anh ấy?' },
    options: [
      {
        id: 'A',
        text: { en: 'Today, as soon as HR tells you.', vi: 'Ngay hôm nay, khi HR vừa báo.' },
        why: {
          en: 'Cutting access a day early tips him off and may itself trigger damage or a dispute before the company has acted formally.',
          vi: 'Quá sớm. Cắt quyền trước một ngày là đánh động anh ấy, và chính việc đó có thể dẫn tới phá hoại hoặc tranh chấp khi công ty còn chưa làm thủ tục chính thức.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'At the same time as he is told, coordinated with HR, then rotate any shared or privileged credentials he knew.',
          vi: 'Đúng lúc anh ấy được thông báo, phối hợp với HR, rồi đổi hết các credential dùng chung hoặc đặc quyền mà anh ấy biết.',
        },
        why: {
          en: 'Correct. Disable accounts while the meeting happens so there is no window to retaliate, then change shared root and service passwords, revoke keys, tokens and certificates, and collect devices.',
          vi: 'Đúng. Disable account ngay trong lúc đang họp để không còn khe hở nào cho việc trả đũa. Sau đó đổi password root và service account dùng chung, thu hồi key, token, certificate và thu lại thiết bị.',
        },
      },
      {
        id: 'C',
        text: { en: 'Right after the meeting ends.', vi: 'Ngay sau khi buổi họp kết thúc.' },
        why: {
          en: 'Even a short gap is enough for a privileged user with remote access to cause serious harm.',
          vi: 'Trễ một nhịp. Chỉ vài phút hở thôi cũng đủ để một người có quyền admin và remote access gây thiệt hại nặng.',
        },
      },
      {
        id: 'D',
        text: { en: 'At the end of his notice period, as per the standard leaver process.', vi: 'Khi hết thời gian báo trước, theo quy trình nghỉ việc thông thường.' },
        why: {
          en: 'A standard leaver process is fine for friendly departures, not for a hostile termination of a privileged user.',
          vi: 'Quy trình nghỉ việc thông thường dành cho người nghỉ êm đẹp, không dùng cho trường hợp cho nghỉ trong căng thẳng mà người đó lại đang giữ quyền admin.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'For involuntary terminations, revoke access at the moment of notification, coordinated in advance with HR and the manager. Remember the parts people forget: shared accounts, service account passwords, API keys, MFA tokens, physical badges, and remote access. Have the user escorted and do an exit interview reminding them of NDA obligations.',
      vi: 'Khi công ty chủ động cho người nghỉ, cắt quyền ngay lúc thông báo, và phải thống nhất trước với HR và quản lý trực tiếp. Nhớ mấy chỗ hay bị quên: account dùng chung, password service account, API key, MFA token, thẻ ra vào và remote access. Cho người đi kèm anh ấy ra ngoài, và làm exit interview để nhắc lại nghĩa vụ NDA.',
    },
    takeaway: {
      en: 'Hostile termination: disable access during the notification, not before, not after.',
      vi: 'Cho nghỉ trong căng thẳng: cắt quyền ngay lúc thông báo, không sớm hơn, không trễ hơn.',
    },
    concepts: ['deprovisioning', 'termination', 'privileged access'],
  },
  {
    id: 'privilege-creep',
    domainId: 'd5',
    title: { en: 'Twelve years, five departments', vi: 'Mười hai năm, năm phòng ban' },
    situation: {
      en: 'An internal audit finds that an accountant who has moved through five departments in twelve years still has access to payroll, procurement approval and the treasury system. Several other long-serving staff show the same pattern.',
      vi: 'Internal audit phát hiện một nhân viên kế toán, mười hai năm qua đã chuyển qua năm phòng ban, giờ vẫn còn quyền vào hệ thống lương, quyền duyệt mua hàng và cả hệ thống ngân quỹ. Nhiều nhân viên lâu năm khác cũng bị y như vậy.',
    },
    question: { en: 'What is the BEST way to address this?', vi: 'Cách xử lý TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Remove the accountant\'s extra access.', vi: 'Thu hồi các quyền thừa của nhân viên kế toán đó.' },
        why: {
          en: 'Necessary, but it fixes one instance. The audit shows a process failure that will keep producing the same problem.',
          vi: 'Cần làm, nhưng mới sửa được một ca. Kết quả audit cho thấy quy trình đang hỏng, và nó sẽ còn đẻ ra đúng vấn đề này nữa.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Introduce access reviews on every role change plus periodic recertification by managers and data owners.',
          vi: 'Rà soát quyền mỗi khi đổi vai trò, cộng thêm việc quản lý và data owner recertify quyền định kỳ.',
        },
        why: {
          en: 'Correct. This fixes the root cause of privilege creep by removing old access on transfer and catching anything missed through regular reviews.',
          vi: 'Đúng. Cách này xử lý tận gốc privilege creep: chuyển vị trí là gỡ quyền cũ, còn sót gì thì các đợt review định kỳ sẽ bắt được.',
        },
      },
      {
        id: 'C',
        text: { en: 'Discipline the accountant for keeping access they did not need.', vi: 'Kỷ luật nhân viên kế toán vì giữ quyền không cần thiết.' },
        why: {
          en: 'The user did not grant the access. Removing it was the organisation\'s responsibility.',
          vi: 'Sai người. Nhân viên đâu có tự cấp quyền cho mình, gỡ quyền là trách nhiệm của tổ chức.',
        },
      },
      {
        id: 'D',
        text: { en: 'Buy a privileged access management (PAM) tool.', vi: 'Mua một tool privileged access management (PAM).' },
        why: {
          en: 'PAM controls administrative accounts. These are business application permissions, and a tool without a review process will not remove them.',
          vi: 'Lệch chỗ. PAM quản lý account admin, còn đây là quyền trong ứng dụng nghiệp vụ. Có tool mà không có quy trình review thì cũng chẳng gỡ được quyền nào.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Privilege creep (or aggregation) is the slow build-up of access as people change roles. It breaks least privilege and can break separation of duties: here the same person could approve purchases and move money. The control is lifecycle management: provision on joining, adjust on moving, revoke on leaving, and recertify periodically.',
      vi: 'Privilege creep (hay aggregation) là quyền cứ tích dần lên mỗi lần nhân viên đổi vai trò. Nó phá least privilege và có thể phá luôn separation of duties: ở đây một người vừa duyệt được mua hàng vừa chuyển được tiền. Control cần có là quản lý vòng đời account: vào thì cấp, chuyển thì điều chỉnh, nghỉ thì thu hồi, và recertify định kỳ.',
    },
    takeaway: {
      en: 'Audit finding about many users = process problem. Pick the answer that fixes the process.',
      vi: 'Audit chỉ ra nhiều người cùng bị = lỗi quy trình. Chọn đáp án sửa quy trình.',
    },
    concepts: ['privilege creep', 'least privilege', 'access review', 'separation of duties'],
  },
  {
    id: 'saas-federation',
    domainId: 'd5',
    title: { en: 'Logging in to a new SaaS HR system', vi: 'Đăng nhập vào hệ thống HR SaaS mới' },
    situation: {
      en: 'The company is moving to a cloud HR platform. Requirements: staff use their existing corporate login with MFA, the vendor must never store their passwords, and access must end automatically when someone leaves.',
      vi: 'Công ty chuyển sang một nền tảng HR trên cloud. Yêu cầu đặt ra: nhân viên đăng nhập bằng account công ty đang dùng, có MFA; vendor tuyệt đối không được lưu password của họ; và ai nghỉ việc thì quyền truy cập phải tự mất.',
    },
    question: { en: 'Which approach meets these requirements?', vi: 'Cách nào đáp ứng được các yêu cầu này?' },
    options: [
      {
        id: 'A',
        text: { en: 'Synchronise password hashes from the directory to the vendor.', vi: 'Đồng bộ password hash từ directory sang vendor.' },
        why: {
          en: 'The vendor would then store credential material, which breaks a stated requirement and widens the impact of a vendor breach.',
          vi: 'Vậy là vendor đang giữ dữ liệu credential, trái ngay với yêu cầu đã nêu, và nếu vendor bị breach thì thiệt hại còn lớn hơn.',
        },
      },
      {
        id: 'B',
        text: { en: 'Create separate vendor accounts with a strong password policy.', vi: 'Tạo account riêng trên hệ thống vendor, áp policy password mạnh.' },
        why: {
          en: 'Separate accounts mean another password to manage and must be removed by hand when people leave.',
          vi: 'Account riêng là thêm một password phải quản lý, mà ai nghỉ thì lại phải xóa bằng tay.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Federate with SAML 2.0 or OpenID Connect: the corporate IdP authenticates users, the SaaS app trusts its assertions, and SCIM handles provisioning.',
          vi: 'Federation bằng SAML 2.0 hoặc OpenID Connect: IdP của công ty xác thực người dùng, app SaaS tin assertion từ IdP, còn SCIM lo provisioning.',
        },
        why: {
          en: 'Correct. Passwords and MFA stay at the identity provider; the service provider only receives signed assertions. Disabling the user at the IdP blocks login, and SCIM deprovisions the account.',
          vi: 'Đúng. Password và MFA nằm ở identity provider, service provider chỉ nhận assertion đã ký. Disable user trên IdP là hết đăng nhập được, rồi SCIM sẽ deprovision account bên kia.',
        },
      },
      {
        id: 'D',
        text: { en: 'Extend the on-premises Kerberos realm to the vendor over the internet.', vi: 'Mở rộng Kerberos realm on-premises sang vendor qua internet.' },
        why: {
          en: 'Kerberos is built for trusted internal networks. Exposing KDCs or creating realm trusts with a SaaS vendor is impractical and risky.',
          vi: 'Không thực tế. Kerberos sinh ra cho mạng nội bộ tin cậy. Đưa KDC ra internet hay dựng realm trust với một vendor SaaS vừa khó làm vừa rủi ro.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Federated identity separates the identity provider (authenticates, holds credentials) from the service provider (consumes assertions). SAML 2.0 uses XML assertions and is common for enterprise web SSO; OpenID Connect adds an identity layer on top of OAuth 2.0. OAuth 2.0 on its own is for authorization (delegated access), not authentication.',
      vi: 'Federated identity tách identity provider (lo xác thực, giữ credential) khỏi service provider (chỉ nhận assertion). SAML 2.0 dùng assertion dạng XML, hay gặp trong SSO web của doanh nghiệp. OpenID Connect thêm lớp identity lên trên OAuth 2.0. Riêng OAuth 2.0 thì chỉ để authorization (ủy quyền truy cập), không phải authentication.',
    },
    takeaway: {
      en: 'SSO to SaaS → federation (SAML/OIDC). OAuth alone = authorization, not authentication.',
      vi: 'SSO vào SaaS → federation (SAML/OIDC). OAuth đứng một mình = authorization, không phải authentication.',
    },
    concepts: ['federation', 'SAML', 'OIDC', 'SCIM'],
  },

  // ── Domain 6: Security Assessment and Testing ────────────────────────────
  {
    id: 'pentest-authorization',
    domainId: 'd6',
    title: { en: 'Verbal OK to start the pentest', vi: 'Mới có cái OK miệng để bắt đầu pentest' },
    situation: {
      en: 'You lead an external penetration test. The IT manager told you on a call, "Go ahead, test everything from Monday." There is no signed document yet, and Monday is tomorrow.',
      vi: 'Bạn lead một đợt external pentest. Trưởng phòng IT nói qua điện thoại: "Cứ làm đi, từ thứ Hai test hết luôn." Tới giờ chưa có giấy tờ gì ký cả, mà mai đã là thứ Hai.',
    },
    question: { en: 'What should you do before testing?', vi: 'Trước khi test, bạn nên làm gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Start Monday. The IT manager has authority over the systems.', vi: 'Thứ Hai bắt đầu. Trưởng phòng IT có quyền với hệ thống mà.' },
        why: {
          en: 'Verbal approval from a mid-level manager may not be valid authority and gives no protection if something breaks or is disputed.',
          vi: 'Một cái gật đầu qua điện thoại của quản lý cấp trung chưa chắc đã đủ thẩm quyền, và nếu có gì hỏng hay bị tranh cãi thì nó không bảo vệ được bạn.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Get written authorization from senior management with scope, rules of engagement, timing and emergency contacts.',
          vi: 'Lấy văn bản cho phép từ lãnh đạo cấp cao, ghi rõ scope, rules of engagement, thời gian và đầu mối liên hệ khẩn cấp.',
        },
        why: {
          en: 'Correct. Without written permission, a penetration test is unauthorized access. The document defines what is in and out of scope, allowed techniques and who to call if something goes wrong.',
          vi: 'Đúng. Không có văn bản cho phép thì pentest chính là truy cập trái phép. Văn bản đó chốt cái gì trong scope, cái gì ngoài scope, kỹ thuật nào được dùng và có chuyện thì gọi ai.',
        },
      },
      {
        id: 'C',
        text: { en: 'Start with passive reconnaissance only until the paperwork arrives.', vi: 'Trong lúc chờ giấy tờ thì chỉ làm passive recon thôi.' },
        why: {
          en: 'Tempting, but the engagement has not started. Without agreed scope you do not even know which assets are yours to look at.',
          vi: 'Nghe thì xuôi, nhưng engagement đã bắt đầu đâu. Chưa chốt scope thì bạn còn không biết tài sản nào là của khách để mà tìm hiểu.',
        },
      },
      {
        id: 'D',
        text: { en: 'Record the call as proof and begin.', vi: 'Ghi âm cuộc gọi làm bằng chứng rồi bắt đầu.' },
        why: {
          en: 'A recording does not define scope or rules, and it may not show the person had authority to approve.',
          vi: 'Bản ghi âm không định nghĩa được scope hay rules, và cũng chưa chắc chứng minh được người đó có quyền duyệt.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Every penetration test starts with written, signed authorization from someone with the authority to grant it (often called the "get out of jail free" letter), plus agreed scope and rules of engagement. The phases that follow are typically planning, discovery/reconnaissance, attack/exploitation and reporting.',
      vi: 'Pentest nào cũng phải bắt đầu bằng văn bản cho phép, có chữ ký của người đủ thẩm quyền (hay gọi là thư "get out of jail free"), kèm scope và rules of engagement đã thống nhất. Sau đó mới đến các giai đoạn thường gặp: lập kế hoạch, discovery/recon, tấn công/khai thác và báo cáo.',
    },
    takeaway: {
      en: 'No written, senior-level authorization = no testing. Not even "light" testing.',
      vi: 'Chưa có văn bản cho phép từ cấp cao = chưa test. Test "nhẹ nhẹ" cũng không.',
    },
    concepts: ['penetration testing', 'rules of engagement', 'authorization'],
  },
  {
    id: 'soc2-type2',
    domainId: 'd6',
    title: { en: 'Assurance from a SaaS vendor', vi: 'Đòi bằng chứng gì từ vendor SaaS?' },
    situation: {
      en: 'You are assessing a SaaS vendor that will store your customers\' personal data. You cannot audit their data centres yourself. You want independent evidence that their security controls were not only designed well but actually worked over the past year.',
      vi: 'Bạn đang đánh giá một vendor SaaS sẽ lưu dữ liệu cá nhân của khách hàng bên bạn. Bạn không tự vào audit data center của họ được. Cái bạn cần là bằng chứng độc lập cho thấy các security control của họ không chỉ thiết kế tốt mà còn thực sự chạy ổn suốt năm qua.',
    },
    question: { en: 'Which report should you request?', vi: 'Bạn nên yêu cầu report nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'SOC 1 Type I', vi: 'SOC 1 Type I' },
        why: {
          en: 'SOC 1 covers controls relevant to financial reporting, and Type I is a point-in-time view of design only.',
          vi: 'Lệch cả hai mặt. SOC 1 nói về control liên quan báo cáo tài chính, còn Type I chỉ nhìn thiết kế tại một thời điểm.',
        },
      },
      {
        id: 'B',
        text: { en: 'SOC 2 Type I', vi: 'SOC 2 Type I' },
        why: {
          en: 'Right scope (security and the other trust services criteria), but Type I only shows controls were suitably designed on one date.',
          vi: 'Đúng phạm vi (security và các trust services criteria khác), nhưng Type I chỉ cho biết control được thiết kế phù hợp vào một ngày cụ thể.',
        },
      },
      {
        id: 'C',
        text: { en: 'SOC 2 Type II', vi: 'SOC 2 Type II' },
        why: {
          en: 'Correct. SOC 2 covers security, availability, processing integrity, confidentiality and privacy, and Type II tests operating effectiveness over a period, usually 6 to 12 months.',
          vi: 'Đúng. SOC 2 phủ security, availability, processing integrity, confidentiality và privacy, còn Type II test xem control có thực sự vận hành hiệu quả trong cả một giai đoạn, thường là 6 đến 12 tháng.',
        },
      },
      {
        id: 'D',
        text: { en: 'SOC 3', vi: 'SOC 3' },
        why: {
          en: 'SOC 3 is a short public summary with no detailed test results, meant for marketing rather than due diligence.',
          vi: 'SOC 3 chỉ là bản tóm tắt công khai, không có kết quả test chi tiết, dùng để làm marketing chứ không đủ cho due diligence.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'SOC 1 = internal controls over financial reporting. SOC 2 = trust services criteria (security, availability, processing integrity, confidentiality, privacy), shared under NDA. SOC 3 = general-use summary of SOC 2. Type I = design at a point in time. Type II = design and operating effectiveness over a period. For vendor security due diligence, SOC 2 Type II is the usual answer.',
      vi: 'SOC 1 = internal control liên quan báo cáo tài chính. SOC 2 = trust services criteria (security, availability, processing integrity, confidentiality, privacy), chỉ chia sẻ theo NDA. SOC 3 = bản tóm tắt SOC 2 để công bố rộng rãi. Type I = thiết kế tại một thời điểm. Type II = thiết kế cộng hiệu quả vận hành trong một giai đoạn. Làm due diligence bảo mật cho vendor thì đáp án quen thuộc là SOC 2 Type II.',
    },
    takeaway: {
      en: 'Security assurance over time from a vendor → SOC 2 Type II.',
      vi: 'Cần bằng chứng bảo mật của vendor qua cả một giai đoạn → SOC 2 Type II.',
    },
    concepts: ['SOC reports', 'third-party assurance', 'SSAE 18'],
  },
  {
    id: 'synthetic-monitoring',
    domainId: 'd6',
    title: { en: 'Checkout broken at 3 a.m.', vi: 'Checkout chết lúc 3 giờ sáng' },
    situation: {
      en: 'An online shop discovered that its checkout page had been failing from 02:00 to 07:00. Nobody noticed because few customers shop at night, and the first complaint arrived at 07:15. Management wants to detect this kind of failure within minutes.',
      vi: 'Một shop online mới phát hiện trang checkout bị lỗi từ 02:00 đến 07:00. Không ai biết vì ban đêm ít khách mua, phải đến 07:15 mới có khiếu nại đầu tiên. Ban lãnh đạo muốn lỗi kiểu này phải phát hiện ra trong vòng vài phút.',
    },
    question: { en: 'Which technique fits BEST?', vi: 'Kỹ thuật nào là lựa chọn TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Real user monitoring (RUM).', vi: 'Real user monitoring (RUM).' },
        why: {
          en: 'RUM measures what real users experience, so when there are no users there is nothing to measure. That is exactly the gap here.',
          vi: 'RUM đo trải nghiệm của người dùng thật, không có người dùng thì chẳng có gì để đo. Chính là cái lỗ hổng trong tình huống này.',
        },
      },
      {
        id: 'B',
        text: { en: 'Synthetic transactions that run a scripted checkout every few minutes and alert on failure.', vi: 'Synthetic transaction chạy script checkout vài phút một lần và alert khi lỗi.' },
        why: {
          en: 'Correct. Synthetic monitoring generates its own test traffic on a schedule, so it detects failures even when no customers are active.',
          vi: 'Đúng. Synthetic monitoring tự tạo traffic test theo lịch, nên vẫn bắt được lỗi kể cả khi không có khách nào đang mua.',
        },
      },
      {
        id: 'C',
        text: { en: 'A quarterly vulnerability scan.', vi: 'Vulnerability scan mỗi quý.' },
        why: {
          en: 'Vulnerability scanning looks for weaknesses, not functional outages, and quarterly is far too slow.',
          vi: 'Không cùng mục đích. Vulnerability scan tìm điểm yếu chứ không phát hiện chức năng bị chết, mà quý một lần thì quá chậm.',
        },
      },
      {
        id: 'D',
        text: { en: 'Static code analysis of the checkout module.', vi: 'Phân tích mã tĩnh module checkout.' },
        why: {
          en: 'SAST finds coding flaws before deployment. It cannot see a runtime failure in production.',
          vi: 'SAST tìm lỗi code trước khi deploy. Nó không nhìn thấy được lỗi lúc đang chạy trên production.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Passive monitoring (RUM) watches real traffic and is great for understanding actual user experience. Active or synthetic monitoring runs scripted transactions to test availability and function on a schedule. They complement each other; for low-traffic periods and critical flows, synthetic checks give predictable detection time.',
      vi: 'Giám sát thụ động (RUM) theo dõi traffic thật, rất hợp để hiểu trải nghiệm thực của người dùng. Giám sát chủ động hay synthetic thì chạy các giao dịch theo script để kiểm tra availability và chức năng theo lịch. Hai cách này bổ sung cho nhau; với khung giờ vắng traffic và các luồng quan trọng, synthetic check cho thời gian phát hiện đoán trước được.',
    },
    takeaway: {
      en: 'No users, still need detection → synthetic transactions.',
      vi: 'Không có người dùng mà vẫn phải phát hiện lỗi → synthetic transaction.',
    },
    concepts: ['synthetic monitoring', 'RUM', 'availability testing'],
  },

  // ── Domain 7: Security Operations ────────────────────────────────────────
  {
    id: 'ransomware-containment',
    domainId: 'd7',
    title: { en: 'Ransomware on the file server', vi: 'Ransomware tấn công file server' },
    situation: {
      en: 'At 14:20 the SOC sees mass file renames with a ".lock" extension on the main file server and ransom notes appearing in shared folders. Two workstations are also showing the same activity. The incident response plan has been invoked.',
      vi: '14:20, SOC thấy file trên file server chính bị đổi tên hàng loạt sang đuôi ".lock", còn trong các thư mục share thì bắt đầu xuất hiện file đòi tiền chuộc. Hai máy trạm cũng đang bị y như vậy. Team đã kích hoạt incident response plan.',
    },
    question: { en: 'What should the team do NEXT?', vi: 'Team nên làm gì TIẾP THEO?' },
    options: [
      {
        id: 'A',
        text: { en: 'Power off the file server immediately.', vi: 'Tắt nguồn file server ngay.' },
        why: {
          en: 'Pulling power loses volatile evidence such as running processes, network connections and possibly encryption keys in memory.',
          vi: 'Mất evidence. Rút điện là mất sạch dữ liệu trong RAM: process đang chạy, kết nối mạng, có khi cả khóa mã hóa.',
        },
      },
      {
        id: 'B',
        text: { en: 'Isolate the affected hosts from the network while keeping them powered on.', vi: 'Cô lập các máy bị nhiễm khỏi mạng nhưng vẫn để máy chạy.' },
        why: {
          en: 'Correct. Containment stops the spread to other systems and backups, while keeping memory evidence available for analysis.',
          vi: 'Đúng. Containment chặn ransomware lan sang hệ thống khác và sang backup, mà evidence trong RAM vẫn còn để phân tích.',
        },
      },
      {
        id: 'C',
        text: { en: 'Restore the file server from last night\'s backup.', vi: 'Restore file server từ bản backup tối qua.' },
        why: {
          en: 'Recovery before containment and eradication means the malware can encrypt the restored data again. It also destroys evidence.',
          vi: 'Sai thứ tự. Restore khi chưa containment và eradication thì mã độc sẽ mã hóa lại dữ liệu vừa restore, mà evidence cũng mất luôn.',
        },
      },
      {
        id: 'D',
        text: { en: 'Contact the attackers to negotiate the ransom.', vi: 'Liên hệ attacker để thương lượng tiền chuộc.' },
        why: {
          en: 'Payment is a business and legal decision for senior management, made much later if at all. It does nothing to stop the current spread.',
          vi: 'Chưa phải lúc. Có trả tiền hay không là quyết định kinh doanh và pháp lý của ban lãnh đạo, nếu có thì cũng rất lâu sau. Còn ngay lúc này nó không chặn được ransomware lây lan.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Follow the incident lifecycle in order. The ISC2 CBK lists: detection, response, mitigation (containment), reporting, recovery, remediation, lessons learned. NIST SP 800-61 groups it as preparation; detection and analysis; containment, eradication and recovery; post-incident activity. After detection, contain first, and choose containment that preserves evidence.',
      vi: 'Cứ đi đúng thứ tự vòng đời xử lý incident. ISC2 CBK chia thành: detection, response, mitigation (containment), reporting, recovery, remediation, lessons learned. NIST SP 800-61 thì gom lại: preparation; detection and analysis; containment, eradication and recovery; post-incident activity. Phát hiện xong thì containment trước, và chọn cách containment nào giữ được evidence.',
    },
    takeaway: {
      en: 'Detect → contain → eradicate → recover → lessons learned. Isolate, do not power off.',
      vi: 'Detect → contain → eradicate → recover → lessons learned. Cô lập chứ đừng rút điện.',
    },
    concepts: ['incident response', 'containment', 'volatile evidence'],
  },
  {
    id: 'forensic-image-integrity',
    domainId: 'd7',
    title: { en: 'Proving the disk image is unchanged', vi: 'Chứng minh image ổ đĩa còn nguyên vẹn' },
    situation: {
      en: 'You seized a laptop from an employee suspected of stealing designs. The case may go to court. You need to analyse the drive and later show the court that your analysis did not alter the evidence.',
      vi: 'Bạn vừa thu giữ laptop của một nhân viên bị nghi lấy cắp bản thiết kế. Vụ này có thể ra tòa. Bạn cần phân tích ổ đĩa, rồi sau đó chứng minh được với tòa là quá trình phân tích không làm thay đổi evidence.',
    },
    question: { en: 'Which approach is BEST?', vi: 'Cách nào TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Boot the laptop and copy the relevant folders to a USB drive.', vi: 'Bật laptop lên rồi chép các thư mục liên quan ra USB.' },
        why: {
          en: 'Booting changes timestamps, logs and swap. Copying files misses deleted data and slack space.',
          vi: 'Hỏng evidence. Boot máy lên là timestamp, log và swap đã thay đổi. Chép file thì lại bỏ sót dữ liệu đã xóa và slack space.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Use a write blocker to make a bit-for-bit image, hash both original and image, analyse a copy, and keep a chain-of-custody log.',
          vi: 'Dùng write blocker tạo image bit-by-bit, hash cả ổ gốc lẫn image, phân tích trên bản copy và ghi chain of custody.',
        },
        why: {
          en: 'Correct. Matching hashes (e.g. SHA-256) show the image equals the original; the write blocker prevents changes; working on a copy protects the master; chain of custody shows who handled the evidence and when.',
          vi: 'Đúng. Hash (ví dụ SHA-256) khớp nhau chứng minh image giống hệt ổ gốc; write blocker giữ cho ổ gốc không bị ghi; làm trên bản copy thì bản master vẫn an toàn; còn chain of custody cho thấy ai đã cầm evidence và vào lúc nào.',
        },
      },
      {
        id: 'C',
        text: { en: 'Analyse the original drive directly so nothing is lost in copying.', vi: 'Phân tích thẳng trên ổ gốc cho khỏi mất gì khi copy.' },
        why: {
          en: 'Working on the original risks altering it, which can make the evidence inadmissible.',
          vi: 'Rủi ro lớn. Làm trên ổ gốc thì dễ làm nó thay đổi, và tòa có thể không chấp nhận evidence nữa.',
        },
      },
      {
        id: 'D',
        text: { en: 'Ask the employee\'s manager to sign a statement that the files were on the laptop.', vi: 'Nhờ quản lý của nhân viên đó ký xác nhận các file có trên laptop.' },
        why: {
          en: 'A statement is not technical proof of integrity and is easily challenged.',
          vi: 'Không đủ sức nặng. Một tờ xác nhận không phải bằng chứng kỹ thuật về tính toàn vẹn, bên kia phản bác rất dễ.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Evidence must be relevant, reliable and admissible. Integrity is shown with hashing at acquisition and after analysis; handling is shown with chain of custody (who, what, when, where, why for every transfer). Capture volatile data first when the system is live (order of volatility: registers/cache, memory, network state, processes, disk, logs, archives).',
      vi: 'Evidence phải liên quan, đáng tin và được tòa chấp nhận (admissible). Tính toàn vẹn thì chứng minh bằng hash lúc thu thập và sau khi phân tích; còn quá trình xử lý thì chứng minh bằng chain of custody (mỗi lần bàn giao ghi rõ ai, cái gì, khi nào, ở đâu, vì sao). Nếu máy đang chạy thì thu dữ liệu volatile trước (order of volatility: register/cache, RAM, trạng thái mạng, process, ổ đĩa, log, archive).',
    },
    takeaway: {
      en: 'Write blocker + hash + work on a copy + chain of custody.',
      vi: 'Write blocker + hash + làm trên bản copy + chain of custody.',
    },
    concepts: ['forensics', 'chain of custody', 'hashing', 'order of volatility'],
  },
  {
    id: 'rto-rpo-strategy',
    domainId: 'd7',
    title: { en: '15 minutes of data, 4 hours of downtime', vi: 'Mất tối đa 15 phút dữ liệu, sập tối đa 4 giờ' },
    situation: {
      en: 'The business impact analysis for the order system says: the business can lose at most 15 minutes of transactions, and the system must be running again within 4 hours of a disaster. The budget is tight.',
      vi: 'Theo BIA của hệ thống đặt hàng, doanh nghiệp chỉ chịu được mất tối đa 15 phút giao dịch, và khi có thảm họa thì hệ thống phải chạy lại trong vòng 4 giờ. Ngân sách thì eo hẹp.',
    },
    question: { en: 'Which strategy is the MOST cost-effective that meets both targets?', vi: 'Phương án nào TIẾT KIỆM NHẤT mà vẫn đạt cả hai mục tiêu?' },
    options: [
      {
        id: 'A',
        text: { en: 'Nightly full backup to tape, restored at a cold site.', vi: 'Full backup ra tape mỗi đêm, restore ở cold site.' },
        why: {
          en: 'Up to 24 hours of data loss breaks the 15-minute RPO, and a cold site usually takes days to bring up, breaking the RTO.',
          vi: 'Trượt cả hai. Có thể mất tới 24 giờ dữ liệu, vượt xa RPO 15 phút; còn cold site thường mất vài ngày mới dựng lên được, vỡ luôn RTO.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Asynchronous replication or log shipping every 5 minutes to a warm site.',
          vi: 'Replication bất đồng bộ hoặc log shipping mỗi 5 phút sang warm site.',
        },
        why: {
          en: 'Correct. Data at most ~5 minutes old meets the 15-minute RPO, and a warm site with hardware ready can be brought up within hours, meeting the 4-hour RTO at lower cost than a hot site.',
          vi: 'Đúng. Dữ liệu cũ nhất chừng 5 phút là đạt RPO 15 phút; warm site có sẵn phần cứng thì dựng lên trong vài giờ, đạt RTO 4 giờ mà rẻ hơn hot site.',
        },
      },
      {
        id: 'C',
        text: { en: 'Synchronous mirroring to an active-active hot site.', vi: 'Mirroring đồng bộ sang hot site chạy active-active.' },
        why: {
          en: 'It meets both targets, but near-zero RPO and RTO cost far more than the business needs. The question asks for the most cost-effective option.',
          vi: 'Đạt cả hai mục tiêu thật, nhưng RPO và RTO gần bằng 0 thì tốn hơn nhu cầu thực tế rất nhiều. Đề hỏi phương án tiết kiệm nhất.',
        },
      },
      {
        id: 'D',
        text: { en: 'Weekly full plus daily differential backups.', vi: 'Full backup hằng tuần, differential hằng ngày.' },
        why: {
          en: 'Daily backups can lose up to a day of transactions, far more than 15 minutes.',
          vi: 'Không đạt RPO. Backup mỗi ngày một lần thì có thể mất tới cả ngày giao dịch, chứ đâu phải 15 phút.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'RPO (recovery point objective) = maximum tolerable data loss, measured backwards from the disaster; it drives backup and replication frequency. RTO (recovery time objective) = maximum time to restore the service; it drives the choice of site (cold: days to weeks, warm: hours to days, hot: minutes to hours). Both must fit within the MTD (maximum tolerable downtime) from the BIA. Choose the cheapest option that meets both.',
      vi: 'RPO (recovery point objective) là lượng dữ liệu tối đa chấp nhận mất, tính ngược từ lúc xảy ra thảm họa; nó quyết định tần suất backup và replication. RTO (recovery time objective) là thời gian tối đa để dịch vụ chạy lại; nó quyết định chọn loại site nào (cold: vài ngày đến vài tuần, warm: vài giờ đến vài ngày, hot: vài phút đến vài giờ). Cả hai đều phải nằm trong MTD (maximum tolerable downtime) lấy từ BIA. Chọn phương án rẻ nhất mà đạt cả hai.',
    },
    takeaway: {
      en: 'RPO → backup frequency. RTO → site type. Pick the cheapest option that meets both.',
      vi: 'RPO → tần suất backup. RTO → loại site. Đạt cả hai thì chọn cái rẻ nhất.',
    },
    concepts: ['RPO', 'RTO', 'MTD', 'BIA', 'recovery sites'],
  },

  // ── Domain 8: Software Development Security ──────────────────────────────
  {
    id: 'security-in-sdlc',
    domainId: 'd8',
    title: { en: 'When should security join the project?', vi: 'Khi nào security nên vào dự án?' },
    situation: {
      en: 'A product team is starting a mobile banking app. The project manager plans to bring in the security team "for a penetration test two weeks before go-live" to keep the schedule fast.',
      vi: 'Một team product bắt đầu làm app mobile banking. Để giữ tiến độ, PM định chỉ gọi team security vào "pentest hai tuần trước go-live".',
    },
    question: { en: 'What should you recommend?', vi: 'Bạn nên đề xuất gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Agree. Testing just before release finds everything that matters.', vi: 'Đồng ý. Test ngay trước khi release là bắt được hết những gì quan trọng.' },
        why: {
          en: 'Design flaws found two weeks before launch are expensive to fix and often get accepted as risk instead.',
          vi: 'Quá muộn. Lỗi thiết kế mà hai tuần trước launch mới thấy thì sửa rất tốn, và cuối cùng thường bị chấp nhận như một risk chứ không sửa.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Include security from project initiation: security requirements, threat modelling during design, secure coding and testing throughout.',
          vi: 'Đưa security vào ngay từ lúc khởi động dự án: security requirement, threat modelling ở khâu thiết kế, secure coding và test xuyên suốt.',
        },
        why: {
          en: 'Correct. Security is cheapest and most effective when defined in requirements and design. Later testing then verifies rather than discovers.',
          vi: 'Đúng. Security rẻ và hiệu quả nhất khi đặt ra ngay từ requirement và thiết kế. Lúc đó test về sau chỉ để xác nhận, chứ không phải để đi tìm lỗi.',
        },
      },
      {
        id: 'C',
        text: { en: 'Add security after launch based on incidents seen in production.', vi: 'Launch xong mới bổ sung security, dựa vào các incident gặp ở production.' },
        why: {
          en: 'Waiting for incidents in a banking app exposes customers and the business to real loss and regulatory action.',
          vi: 'Với app ngân hàng mà ngồi đợi incident thì khách hàng và công ty sẽ mất tiền thật, lại còn bị cơ quan quản lý xử lý.',
        },
      },
      {
        id: 'D',
        text: { en: 'Put a web application firewall in front of the API and skip the code-level work.', vi: 'Đặt WAF trước API và bỏ qua phần việc ở mức code.' },
        why: {
          en: 'A WAF is a useful compensating layer but cannot fix business logic flaws or insecure design.',
          vi: 'Chưa đủ. WAF là lớp bù trừ có ích, nhưng không sửa được lỗi business logic hay thiết kế thiếu an toàn.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'The earlier a defect is found, the cheaper it is to fix. CISSP expects security in every SDLC phase: requirements (security and privacy requirements), design (threat modelling, e.g. STRIDE), development (secure coding, code review, SAST), testing (DAST, penetration testing), deployment and operations (hardening, monitoring, patching) and disposal.',
      vi: 'Lỗi phát hiện càng sớm thì sửa càng rẻ. CISSP muốn security có mặt ở mọi giai đoạn SDLC: requirement (yêu cầu về security và privacy), thiết kế (threat modelling, ví dụ STRIDE), phát triển (secure coding, code review, SAST), test (DAST, pentest), deploy và vận hành (hardening, monitoring, patch) và cả lúc loại bỏ hệ thống.',
    },
    takeaway: {
      en: '"When should security be involved?" → at the beginning, and in every phase.',
      vi: '"Khi nào security nên tham gia?" → ngay từ đầu, và ở mọi giai đoạn.',
    },
    concepts: ['SDLC', 'threat modelling', 'shift left'],
  },
  {
    id: 'sql-injection-fix',
    domainId: 'd8',
    title: { en: 'Fixing SQL injection properly', vi: 'Sửa SQL injection cho đúng' },
    situation: {
      en: 'A penetration test shows that the customer search box builds SQL by concatenating user input, and the tester dumped the users table. Developers propose several fixes.',
      vi: 'Pentest cho thấy ô tìm kiếm khách hàng ghép thẳng input của người dùng vào câu SQL, và tester đã dump được cả bảng users. Dev đưa ra mấy cách sửa.',
    },
    question: { en: 'Which fix addresses the root cause BEST?', vi: 'Cách nào xử lý tận gốc TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Add a WAF rule that blocks requests containing SQL keywords.', vi: 'Thêm rule WAF chặn request có chứa từ khóa SQL.' },
        why: {
          en: 'Helpful as defence in depth, but filters can be bypassed with encoding tricks and the vulnerable code remains.',
          vi: 'Có ích như một lớp defence in depth, nhưng filter thì lách được bằng các trò encoding, mà đoạn code lỗi vẫn nằm nguyên đó.',
        },
      },
      {
        id: 'B',
        text: { en: 'Escape single quotes in the input with a custom function.', vi: 'Viết hàm riêng để escape dấu nháy đơn trong input.' },
        why: {
          en: 'Home-made escaping is easy to get wrong and misses cases such as numeric parameters or different encodings.',
          vi: 'Dễ sai. Tự viết hàm escape thì rất hay sót, ví dụ tham số kiểu số hoặc encoding khác.',
        },
      },
      {
        id: 'C',
        text: { en: 'Use parameterized queries (prepared statements), plus allow-list input validation and a least-privilege database account.', vi: 'Dùng parameterized query (prepared statement), kèm input validation theo allow-list và account database least privilege.' },
        why: {
          en: 'Correct. Parameterized queries keep data separate from code so input can never change the query structure. Validation and least privilege limit damage from anything missed.',
          vi: 'Đúng. Parameterized query tách dữ liệu khỏi code nên input không thể nào đổi được cấu trúc câu query. Input validation và least privilege thì giới hạn thiệt hại nếu còn sót chỗ nào.',
        },
      },
      {
        id: 'D',
        text: { en: 'Hide database error messages from users.', vi: 'Ẩn thông báo lỗi database với người dùng.' },
        why: {
          en: 'This makes exploitation harder (no error-based injection) but blind SQL injection still works.',
          vi: 'Chỉ che bớt thôi. Khai thác khó hơn (hết error-based injection) nhưng blind SQL injection vẫn chạy như thường.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Injection happens when untrusted data is interpreted as code. The primary fix is to keep them separate: parameterized queries or safe ORM APIs. Then add layers: input validation (allow-list), least-privilege DB accounts, generic error messages and a WAF. On the exam, prefer fixing the code over compensating controls when asked for the BEST or root-cause fix.',
      vi: 'Injection xảy ra khi dữ liệu không tin cậy bị hiểu thành code. Cách sửa chính là tách hai thứ đó ra: parameterized query hoặc API ORM an toàn. Sau đó mới thêm các lớp khác: input validation (allow-list), account DB least privilege, thông báo lỗi chung chung và WAF. Đi thi mà đề hỏi cách TỐT NHẤT hay sửa tận gốc thì ưu tiên sửa code, đừng chọn compensating control.',
    },
    takeaway: {
      en: 'SQL injection → parameterized queries. WAF is a compensating layer, not the fix.',
      vi: 'SQL injection → parameterized query. WAF chỉ là lớp bù trừ, không phải cách sửa.',
    },
    concepts: ['SQL injection', 'parameterized queries', 'defence in depth'],
  },
  {
    id: 'vulnerable-dependency',
    domainId: 'd8',
    title: { en: 'A critical CVE in a library you did not write', vi: 'CVE nghiêm trọng trong thư viện bạn không hề viết' },
    situation: {
      en: 'A critical remote code execution CVE is published for a popular open-source logging library. It takes your team three days just to find which of 140 internal services include the library, some only as a dependency of a dependency.',
      vi: 'Một thư viện logging open-source rất phổ biến vừa dính CVE remote code execution mức critical. Riêng việc tìm xem trong 140 service nội bộ, service nào có dùng thư viện này đã ngốn của team bạn ba ngày, vì có service chỉ kéo nó vào gián tiếp qua dependency của dependency.',
    },
    question: { en: 'Which control would MOST improve your response next time?', vi: 'Lần sau, control nào cải thiện khả năng ứng phó của bạn NHIỀU NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Static application security testing (SAST) on your own code.', vi: 'Chạy SAST trên code của mình.' },
        why: {
          en: 'SAST analyses the code you wrote. It is not designed to inventory third-party components and their versions.',
          vi: 'Sai công cụ. SAST phân tích code do bạn viết, nó không sinh ra để kiểm kê component bên thứ ba và version của chúng.',
        },
      },
      {
        id: 'B',
        text: { en: 'Software composition analysis in the CI pipeline and an SBOM for every service.', vi: 'Software composition analysis (SCA) trong CI pipeline và SBOM cho từng service.' },
        why: {
          en: 'Correct. An SBOM lists every component, including transitive dependencies; SCA matches them against vulnerability databases and can block builds. Finding affected services becomes a query, not a three-day hunt.',
          vi: 'Đúng. SBOM liệt kê mọi component, kể cả transitive dependency; SCA đem chúng đối chiếu với cơ sở dữ liệu lỗ hổng và có thể chặn build. Tìm service bị ảnh hưởng lúc đó chỉ là chạy một câu query, chứ không phải lùng sục ba ngày.',
        },
      },
      {
        id: 'C',
        text: { en: 'Code signing for all releases.', vi: 'Code signing cho mọi bản release.' },
        why: {
          en: 'Code signing proves who published a build and that it was not altered. It says nothing about vulnerable components inside.',
          vi: 'Không liên quan. Code signing chứng minh ai phát hành bản build và bản build không bị sửa. Nó không nói gì về các component có lỗ hổng nằm bên trong.',
        },
      },
      {
        id: 'D',
        text: { en: 'Ban open-source libraries.', vi: 'Cấm dùng thư viện open-source.' },
        why: {
          en: 'Unrealistic and not risk-based. Commercial software has vulnerabilities too, and you would still need to track components.',
          vi: 'Không thực tế, cũng không dựa trên risk. Phần mềm thương mại cũng có lỗ hổng, và bạn vẫn phải theo dõi component như thường.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Third-party and open-source components are part of your attack surface and your software supply chain. Software composition analysis plus a software bill of materials gives you inventory and continuous vulnerability matching. Pair it with a patch process and a policy for acceptable licences and component age.',
      vi: 'Component bên thứ ba và open-source cũng là một phần attack surface và software supply chain của bạn. Software composition analysis cộng với SBOM (software bill of materials) cho bạn danh sách component và đối chiếu lỗ hổng liên tục. Đi kèm thì cần quy trình patch và policy về license được phép dùng và độ cũ của component.',
    },
    takeaway: {
      en: 'Third-party component risk → SCA + SBOM. SAST is for your own code.',
      vi: 'Risk từ component bên thứ ba → SCA + SBOM. SAST là cho code của mình.',
    },
    concepts: ['SCA', 'SBOM', 'supply chain'],
  },
];

/** All scenarios, grouped by domain (sort is stable, so order within a domain is kept). */
export const SCENARIOS: Scenario[] = [...CORE_SCENARIOS, ...MORE_SCENARIOS, ...HARD_SCENARIOS].sort((a, b) => a.domainId.localeCompare(b.domainId));

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
