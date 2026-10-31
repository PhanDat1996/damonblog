// Second set of practice scenarios: high-yield topics not covered by the first 24.
// Same rules as scenarios.ts: four options, one answer, a reason for every option, EN + VI.

import type { Scenario } from './scenarios.ts';

export const MORE_SCENARIOS: Scenario[] = [
  // ── Domain 1 ──────────────────────────────────────────────────────────────
  {
    id: 'due-diligence-vs-due-care',
    domainId: 'd1',
    title: { en: 'Choosing a payroll provider', vi: 'Chọn nhà cung cấp dịch vụ tính lương' },
    situation: {
      en: 'Your company plans to outsource payroll to a cloud provider. The security team is involved before and after the contract is signed.',
      vi: 'Công ty bạn dự định thuê ngoài dịch vụ tính lương cho một nhà cung cấp cloud. Team bảo mật tham gia cả trước và sau khi ký hợp đồng.',
    },
    question: { en: 'Which activity is an example of due diligence?', vi: 'Hoạt động nào là ví dụ của due diligence?' },
    options: [
      {
        id: 'A',
        text: {
          en: 'Reviewing the provider\'s SOC 2 Type II report, breach history and financial stability before signing.',
          vi: 'Xem xét báo cáo SOC 2 Type II, lịch sử sự cố và tình hình tài chính của nhà cung cấp trước khi ký.',
        },
        why: {
          en: 'Correct. Due diligence is the research and investigation you do to understand the risk before making a decision.',
          vi: 'Đúng. Due diligence là việc tìm hiểu, điều tra để hiểu rõ rủi ro trước khi đưa ra quyết định.',
        },
      },
      {
        id: 'B',
        text: { en: 'Enabling SSO and MFA for the payroll application after go-live.', vi: 'Bật SSO và MFA cho ứng dụng tính lương sau khi đưa vào sử dụng.' },
        why: {
          en: 'This is due care: implementing a reasonable control once the decision has been made.',
          vi: 'Đây là due care: triển khai biện pháp hợp lý sau khi quyết định đã được đưa ra.',
        },
      },
      {
        id: 'C',
        text: { en: 'Training payroll staff on the new data-handling procedure.', vi: 'Đào tạo nhân viên tính lương về quy trình xử lý dữ liệu mới.' },
        why: {
          en: 'Training is acting on what you know, so it is due care.',
          vi: 'Đào tạo là hành động dựa trên những gì đã biết, nên thuộc due care.',
        },
      },
      {
        id: 'D',
        text: { en: 'Encrypting the payroll export files sent to the bank.', vi: 'Mã hóa các file xuất lương gửi sang ngân hàng.' },
        why: {
          en: 'Applying encryption is implementing a safeguard, which is due care.',
          vi: 'Áp dụng mã hóa là triển khai biện pháp bảo vệ, thuộc due care.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Due diligence = knowing: investigation, assessment and planning that happen before and around a decision (vendor assessments, background checks, risk assessments). Due care = doing: what a prudent person would do to protect assets once the decision is made (implementing controls, patching, training). Failing to exercise due care is negligence and creates liability for management.',
      vi: 'Due diligence = tìm hiểu: điều tra, đánh giá, lập kế hoạch trước và xung quanh một quyết định (đánh giá nhà cung cấp, kiểm tra lý lịch, đánh giá rủi ro). Due care = hành động: làm những gì một người thận trọng sẽ làm để bảo vệ tài sản sau khi đã quyết định (triển khai biện pháp, vá lỗi, đào tạo). Không thực hiện due care là sơ suất (negligence) và tạo ra trách nhiệm pháp lý cho ban lãnh đạo.',
    },
    takeaway: {
      en: 'Diligence = investigate first. Care = act reasonably after.',
      vi: 'Diligence = tìm hiểu trước. Care = hành động hợp lý sau.',
    },
    concepts: ['due diligence', 'due care', 'prudent person rule', 'third-party risk'],
  },
  {
    id: 'risk-acceptance-sign-off',
    domainId: 'd1',
    title: { en: 'A legacy system nobody can replace', vi: 'Hệ thống cũ không thể thay thế' },
    situation: {
      en: 'A penetration test found that a production-line control application runs on an unsupported operating system. Replacing it would cost $1.2 million and the original vendor has gone out of business. The plant\'s vice president says "we will live with it". The IT manager suggests leaving it out of the audit report to avoid a finding.',
      vi: 'Đợt pentest phát hiện ứng dụng điều khiển dây chuyền sản xuất chạy trên hệ điều hành đã hết hỗ trợ. Thay thế sẽ tốn $1,2 triệu và nhà cung cấp gốc đã phá sản. Phó giám đốc nhà máy nói "cứ để vậy". Trưởng phòng IT đề nghị bỏ nó ra khỏi báo cáo audit để tránh bị ghi nhận lỗi.',
    },
    question: { en: 'What is the BEST way to handle this risk?', vi: 'Cách xử lý rủi ro này TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Leave it out of the report, as the IT manager suggests.', vi: 'Bỏ ra khỏi báo cáo như trưởng phòng IT đề nghị.' },
        why: {
          en: 'Hiding a known risk is ignoring it, not accepting it. It removes management\'s ability to make an informed decision and is an ethics problem.',
          vi: 'Che giấu rủi ro đã biết là phớt lờ nó, không phải chấp nhận. Việc này tước đi khả năng ra quyết định có hiểu biết của lãnh đạo và là vấn đề đạo đức.',
        },
      },
      {
        id: 'B',
        text: { en: 'The security manager formally accepts the risk on the company\'s behalf.', vi: 'Quản lý bảo mật chính thức chấp nhận rủi ro thay cho công ty.' },
        why: {
          en: 'Security advises; it does not own business risk. Acceptance must come from the accountable business owner or senior management.',
          vi: 'Bảo mật chỉ tư vấn, không sở hữu rủi ro kinh doanh. Việc chấp nhận phải đến từ chủ sở hữu nghiệp vụ chịu trách nhiệm hoặc lãnh đạo cấp cao.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Record it in the risk register, apply compensating controls such as network isolation, and have the accountable executive sign off on the residual risk with a review date.',
          vi: 'Ghi vào sổ đăng ký rủi ro (risk register), áp dụng biện pháp bù trừ như cô lập mạng, và để lãnh đạo chịu trách nhiệm ký chấp nhận rủi ro còn lại (residual risk) kèm ngày rà soát lại.',
        },
        why: {
          en: 'Correct. Mitigate what you reasonably can, then let the risk owner make a documented, informed acceptance of what remains and revisit it periodically.',
          vi: 'Đúng. Giảm thiểu những gì có thể làm hợp lý, sau đó để chủ sở hữu rủi ro chấp nhận phần còn lại một cách có hiểu biết, có tài liệu, và rà soát định kỳ.',
        },
      },
      {
        id: 'D',
        text: { en: 'Shut the production line down until the application is replaced.', vi: 'Dừng dây chuyền sản xuất cho đến khi thay được ứng dụng.' },
        why: {
          en: 'Avoidance is a valid response but here it is out of proportion to the risk and is a business decision security cannot impose.',
          vi: 'Né tránh (avoid) là một phương án hợp lệ nhưng ở đây không tương xứng với rủi ro và là quyết định kinh doanh mà bảo mật không thể áp đặt.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'The four risk responses are avoid, transfer, mitigate and accept. Acceptance is legitimate only when it is informed, documented and approved by someone with the authority to own the risk, usually senior management or the business owner. Risk that is not recorded has not been accepted, it has been ignored. Residual risk is what is left after controls, and it should fit within the organisation\'s risk appetite.',
      vi: 'Bốn cách phản ứng với rủi ro là né tránh, chuyển giao, giảm thiểu và chấp nhận. Chấp nhận chỉ hợp lệ khi có hiểu biết, có tài liệu và được phê duyệt bởi người có thẩm quyền sở hữu rủi ro, thường là lãnh đạo cấp cao hoặc chủ sở hữu nghiệp vụ. Rủi ro không được ghi nhận thì chưa được chấp nhận, mà là bị phớt lờ. Residual risk là phần còn lại sau khi áp dụng biện pháp, và cần nằm trong khẩu vị rủi ro của tổ chức.',
    },
    takeaway: {
      en: 'Ignoring is not accepting. Senior management owns and signs off residual risk.',
      vi: 'Phớt lờ không phải là chấp nhận. Lãnh đạo cấp cao sở hữu và ký chấp nhận rủi ro còn lại.',
    },
    concepts: ['risk response', 'risk acceptance', 'residual risk', 'risk register'],
  },

  // ── Domain 2 ──────────────────────────────────────────────────────────────
  {
    id: 'gdpr-controller-processor',
    domainId: 'd2',
    title: { en: 'A breach at the newsletter vendor', vi: 'Sự cố tại nhà cung cấp gửi newsletter' },
    situation: {
      en: 'A Vietnamese online shop sells to customers in Germany and France. It uses a US email-marketing SaaS to send newsletters; the contract says the vendor processes the data only on the shop\'s instructions. The vendor is breached and customer names and emails are exposed.',
      vi: 'Một cửa hàng online của Việt Nam bán hàng cho khách ở Đức và Pháp. Cửa hàng dùng một SaaS email marketing của Mỹ để gửi newsletter; hợp đồng quy định nhà cung cấp chỉ xử lý dữ liệu theo chỉ dẫn của cửa hàng. Nhà cung cấp bị xâm nhập, lộ tên và email của khách hàng.',
    },
    question: { en: 'Under GDPR, which statement is correct?', vi: 'Theo GDPR, nhận định nào đúng?' },
    options: [
      {
        id: 'A',
        text: { en: 'GDPR does not apply because the shop is not based in the EU.', vi: 'GDPR không áp dụng vì cửa hàng không đặt trụ sở ở EU.' },
        why: {
          en: 'GDPR applies to organisations outside the EU that offer goods or services to people in the EU.',
          vi: 'GDPR áp dụng cả cho tổ chức ngoài EU nếu cung cấp hàng hóa hoặc dịch vụ cho người ở EU.',
        },
      },
      {
        id: 'B',
        text: { en: 'The vendor is the controller, so the shop has no obligations.', vi: 'Nhà cung cấp là controller nên cửa hàng không có nghĩa vụ gì.' },
        why: {
          en: 'The vendor acts only on the shop\'s instructions, which makes it a processor, not a controller.',
          vi: 'Nhà cung cấp chỉ hành động theo chỉ dẫn của cửa hàng, nên là processor, không phải controller.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'The shop is the controller and stays accountable. The vendor, as processor, must inform the shop without undue delay, and the shop must notify the supervisory authority within 72 hours unless the breach is unlikely to put people at risk.',
          vi: 'Cửa hàng là controller và vẫn chịu trách nhiệm giải trình. Nhà cung cấp, với vai trò processor, phải báo cho cửa hàng không chậm trễ, và cửa hàng phải thông báo cho cơ quan giám sát trong 72 giờ, trừ khi sự cố khó gây rủi ro cho người dùng.',
        },
        why: {
          en: 'Correct. The controller decides why and how personal data is processed and keeps accountability even when a processor handles the data.',
          vi: 'Đúng. Controller quyết định mục đích và cách thức xử lý dữ liệu cá nhân, và vẫn chịu trách nhiệm giải trình ngay cả khi processor xử lý dữ liệu.',
        },
      },
      {
        id: 'D',
        text: { en: 'Only the vendor must deal with the breach because it happened on its systems.', vi: 'Chỉ nhà cung cấp phải xử lý sự cố vì nó xảy ra trên hệ thống của họ.' },
        why: {
          en: 'Where the breach happened does not move accountability. Outsourcing transfers tasks, not responsibility to the data subjects.',
          vi: 'Sự cố xảy ra ở đâu không làm thay đổi trách nhiệm giải trình. Thuê ngoài chuyển giao công việc, không chuyển giao trách nhiệm với chủ thể dữ liệu.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'GDPR roles: the data controller decides the purposes and means of processing; the data processor processes on the controller\'s behalf under a contract; the data subject is the person the data is about; a DPO is required in some cases. The controller notifies the supervisory authority within 72 hours of becoming aware of a breach, unless it is unlikely to result in a risk to individuals, and informs the individuals when the risk is high.',
      vi: 'Các vai trò trong GDPR: data controller quyết định mục đích và phương tiện xử lý; data processor xử lý thay cho controller theo hợp đồng; data subject là người mà dữ liệu nói về; DPO bắt buộc trong một số trường hợp. Controller thông báo cho cơ quan giám sát trong 72 giờ kể từ khi biết về sự cố, trừ khi sự cố khó gây rủi ro cho cá nhân, và thông báo cho từng người khi rủi ro cao.',
    },
    takeaway: {
      en: 'Controller decides and stays accountable. Processor acts on instructions. 72 hours to notify the authority.',
      vi: 'Controller quyết định và chịu trách nhiệm. Processor làm theo chỉ dẫn. 72 giờ để báo cơ quan giám sát.',
    },
    concepts: ['GDPR', 'data controller', 'data processor', 'breach notification'],
  },
  {
    id: 'scoping-and-tailoring',
    domainId: 'd2',
    title: { en: 'A control baseline that does not quite fit', vi: 'Bộ kiểm soát chuẩn không hoàn toàn phù hợp' },
    situation: {
      en: 'Your organisation adopts the NIST SP 800-53 moderate baseline for a new internal system. Several controls cover wireless access, but the system has no wireless components. One password-complexity control does not fit the system\'s passwordless FIDO2 login.',
      vi: 'Tổ chức của bạn áp dụng baseline mức moderate của NIST SP 800-53 cho một hệ thống nội bộ mới. Một số kiểm soát nói về truy cập không dây, nhưng hệ thống không có thành phần không dây nào. Một kiểm soát về độ phức tạp mật khẩu không phù hợp với cơ chế đăng nhập không mật khẩu FIDO2 của hệ thống.',
    },
    question: { en: 'What is the correct way to apply the baseline?', vi: 'Cách áp dụng baseline đúng là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Implement every control exactly as written.', vi: 'Triển khai mọi kiểm soát đúng y như văn bản.' },
        why: {
          en: 'Controls that do not apply waste money and effort, and forcing a password rule onto passwordless login could weaken the design.',
          vi: 'Kiểm soát không áp dụng được sẽ lãng phí tiền và công sức, và ép quy tắc mật khẩu lên cơ chế không mật khẩu có thể làm yếu thiết kế.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Scope out the controls that do not apply, tailor the others to fit, and document the reasoning.',
          vi: 'Loại bỏ (scope out) các kiểm soát không áp dụng, điều chỉnh (tailor) các kiểm soát còn lại cho phù hợp, và ghi lại lý do.',
        },
        why: {
          en: 'Correct. Baselines are starting points. Scoping removes what is irrelevant, tailoring adjusts controls to the environment, and documentation lets auditors follow the decisions.',
          vi: 'Đúng. Baseline là điểm khởi đầu. Scoping loại bỏ phần không liên quan, tailoring điều chỉnh kiểm soát theo môi trường, và tài liệu giúp kiểm toán viên theo dõi được các quyết định.',
        },
      },
      {
        id: 'C',
        text: { en: 'Drop the baseline and design controls from scratch.', vi: 'Bỏ baseline và tự thiết kế kiểm soát từ đầu.' },
        why: {
          en: 'Throwing away a proven baseline loses coverage and makes compliance harder to show.',
          vi: 'Bỏ một baseline đã được kiểm chứng làm mất độ bao phủ và khó chứng minh tuân thủ hơn.',
        },
      },
      {
        id: 'D',
        text: { en: 'Ask the auditors to waive the controls that are inconvenient.', vi: 'Đề nghị kiểm toán viên miễn các kiểm soát gây bất tiện.' },
        why: {
          en: 'Auditors assess; they do not design your control set. "Inconvenient" is not a risk-based reason.',
          vi: 'Kiểm toán viên đánh giá, không thiết kế bộ kiểm soát cho bạn. "Bất tiện" không phải là lý do dựa trên rủi ro.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Scoping = deciding which baseline controls apply to your system. Tailoring = modifying the selected controls to match your mission and environment (including compensating controls and parameter values). Supplementation = adding controls beyond the baseline for extra risk. All three are expected and must be documented.',
      vi: 'Scoping = xác định kiểm soát nào trong baseline áp dụng cho hệ thống. Tailoring = điều chỉnh các kiểm soát đã chọn cho phù hợp với nhiệm vụ và môi trường (bao gồm biện pháp bù trừ và giá trị tham số). Supplementation = bổ sung kiểm soát ngoài baseline cho rủi ro cao hơn. Cả ba đều được kỳ vọng và phải được ghi lại.',
    },
    takeaway: {
      en: 'Scope out what does not apply, tailor what does, supplement where risk is higher. Document it.',
      vi: 'Loại bỏ phần không áp dụng, điều chỉnh phần áp dụng, bổ sung nơi rủi ro cao hơn. Ghi lại tất cả.',
    },
    concepts: ['scoping', 'tailoring', 'baselines', 'NIST SP 800-53'],
  },

  // ── Domain 3 ──────────────────────────────────────────────────────────────
  {
    id: 'saas-shared-responsibility',
    domainId: 'd3',
    title: { en: '"Anyone with the link"', vi: '"Bất kỳ ai có link"' },
    situation: {
      en: 'Your company uses a SaaS CRM. An employee shared a customer report with a link set to "anyone with the link". A search engine indexed it and customer data was exposed. An executive says, "The vendor hosts it, so this is the vendor\'s problem."',
      vi: 'Công ty bạn dùng một CRM dạng SaaS. Một nhân viên chia sẻ báo cáo khách hàng bằng link đặt chế độ "bất kỳ ai có link". Công cụ tìm kiếm đã index link đó và dữ liệu khách hàng bị lộ. Một lãnh đạo nói: "Nhà cung cấp host hệ thống, nên đây là vấn đề của họ."',
    },
    question: { en: 'Who is accountable for the exposed data?', vi: 'Ai chịu trách nhiệm giải trình về dữ liệu bị lộ?' },
    options: [
      {
        id: 'A',
        text: { en: 'The SaaS vendor, because it hosts the application.', vi: 'Nhà cung cấp SaaS, vì họ host ứng dụng.' },
        why: {
          en: 'The vendor secures the platform. It did not decide who could see the report; your user did.',
          vi: 'Nhà cung cấp bảo vệ nền tảng. Họ không quyết định ai được xem báo cáo; người dùng của bạn quyết định.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Your company. Under SaaS the customer still owns its data, users, access and sharing settings.',
          vi: 'Công ty bạn. Với SaaS, khách hàng vẫn sở hữu dữ liệu, người dùng, phân quyền và cấu hình chia sẻ.',
        },
        why: {
          en: 'Correct. In every cloud model the customer remains accountable for its data and for how its users configure access.',
          vi: 'Đúng. Trong mọi mô hình cloud, khách hàng vẫn chịu trách nhiệm giải trình về dữ liệu của mình và cách người dùng cấu hình truy cập.',
        },
      },
      {
        id: 'C',
        text: { en: 'Only the employee who created the link.', vi: 'Chỉ nhân viên đã tạo link.' },
        why: {
          en: 'The employee made the mistake, but the organisation is accountable for the policy, training and settings that allowed it.',
          vi: 'Nhân viên gây ra lỗi, nhưng tổ chức chịu trách nhiệm về chính sách, đào tạo và cấu hình đã cho phép lỗi đó xảy ra.',
        },
      },
      {
        id: 'D',
        text: { en: 'Nobody, because no system was hacked.', vi: 'Không ai cả, vì không có hệ thống nào bị tấn công.' },
        why: {
          en: 'A breach does not need an attacker. Unauthorised disclosure through misconfiguration is still a breach.',
          vi: 'Sự cố không cần có kẻ tấn công. Lộ dữ liệu trái phép do cấu hình sai vẫn là sự cố vi phạm dữ liệu.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Shared responsibility: in IaaS the customer manages the OS, applications and data; in PaaS the provider also manages the OS and runtime; in SaaS the provider manages almost everything up to the application. In all three the customer is responsible for its data, identities and access configuration. You can outsource tasks, but accountability for your data stays with you.',
      vi: 'Trách nhiệm chia sẻ: với IaaS, khách hàng quản lý hệ điều hành, ứng dụng và dữ liệu; với PaaS, nhà cung cấp quản lý thêm hệ điều hành và runtime; với SaaS, nhà cung cấp quản lý gần như mọi thứ đến tận ứng dụng. Trong cả ba mô hình, khách hàng chịu trách nhiệm về dữ liệu, định danh và cấu hình truy cập. Bạn có thể thuê ngoài công việc, nhưng trách nhiệm giải trình về dữ liệu vẫn thuộc về bạn.',
    },
    takeaway: {
      en: 'Cloud model changes who runs what. Your data is always your responsibility.',
      vi: 'Mô hình cloud thay đổi ai vận hành gì. Dữ liệu của bạn luôn là trách nhiệm của bạn.',
    },
    concepts: ['shared responsibility', 'SaaS', 'cloud security', 'accountability'],
  },
  {
    id: 'kerckhoffs-secret-algorithm',
    domainId: 'd3',
    title: { en: 'An algorithm too secret to study', vi: 'Thuật toán bí mật đến mức không ai được nghiên cứu' },
    situation: {
      en: 'A vendor pitches a file-encryption product built on its own proprietary algorithm. The salesperson says it is safer than AES "because attackers cannot study an algorithm they have never seen".',
      vi: 'Một nhà cung cấp chào sản phẩm mã hóa file dùng thuật toán độc quyền tự phát triển. Nhân viên bán hàng nói nó an toàn hơn AES "vì kẻ tấn công không thể nghiên cứu một thuật toán mà họ chưa từng thấy".',
    },
    question: { en: 'How should you evaluate this claim?', vi: 'Bạn nên đánh giá tuyên bố này thế nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Accept it. Keeping the algorithm secret adds an extra layer of defence.', vi: 'Chấp nhận. Giữ bí mật thuật toán tạo thêm một lớp phòng thủ.' },
        why: {
          en: 'Secret algorithms get little expert review, and once reverse engineered they cannot be changed the way a key can.',
          vi: 'Thuật toán bí mật ít được chuyên gia kiểm định, và khi bị dịch ngược thì không thể thay đổi như thay khóa.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Reject it. Prefer a published, peer-reviewed algorithm such as AES in a validated module; security should depend only on the key.',
          vi: 'Bác bỏ. Ưu tiên thuật toán công khai, đã được kiểm định như AES trong một module đã được xác nhận; độ an toàn chỉ nên phụ thuộc vào khóa.',
        },
        why: {
          en: 'Correct. This is Kerckhoffs\'s principle: a cryptosystem should stay secure even if everything except the key is public.',
          vi: 'Đúng. Đây là nguyên lý Kerckhoffs: một hệ mã phải an toàn ngay cả khi mọi thứ trừ khóa đều công khai.',
        },
      },
      {
        id: 'C',
        text: { en: 'Accept it if the vendor\'s key length is longer than 256 bits.', vi: 'Chấp nhận nếu độ dài khóa của nhà cung cấp lớn hơn 256 bit.' },
        why: {
          en: 'Key length means nothing if the algorithm itself is weak. A flawed design can be broken without trying every key.',
          vi: 'Độ dài khóa không có ý nghĩa nếu bản thân thuật toán yếu. Thiết kế có lỗi có thể bị phá mà không cần thử mọi khóa.',
        },
      },
      {
        id: 'D',
        text: { en: 'Encrypt everything twice, once with AES and once with the vendor\'s algorithm.', vi: 'Mã hóa hai lần, một lần bằng AES và một lần bằng thuật toán của nhà cung cấp.' },
        why: {
          en: 'This adds cost and complexity without fixing the problem, and double encryption gains less than expected because of meet-in-the-middle attacks.',
          vi: 'Cách này tăng chi phí và độ phức tạp mà không giải quyết vấn đề, và mã hóa hai lần không mạnh như kỳ vọng do tấn công meet-in-the-middle.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Kerckhoffs\'s principle says the only secret should be the key. Open algorithms like AES, RSA and SHA-2 have survived years of public cryptanalysis. "Security through obscurity" is not a control you can rely on. When buying crypto, look for standard algorithms and independent validation such as FIPS 140-3.',
      vi: 'Nguyên lý Kerckhoffs nói rằng thứ duy nhất cần giữ bí mật là khóa. Các thuật toán mở như AES, RSA, SHA-2 đã trải qua nhiều năm phân tích công khai. "Bảo mật nhờ che giấu" (security through obscurity) không phải là biện pháp có thể dựa vào. Khi mua sản phẩm mã hóa, hãy tìm thuật toán chuẩn và chứng nhận độc lập như FIPS 140-3.',
    },
    takeaway: {
      en: 'Only the key should be secret. Avoid proprietary crypto.',
      vi: 'Chỉ khóa cần bí mật. Tránh dùng thuật toán mã hóa độc quyền.',
    },
    concepts: ['Kerckhoffs\'s principle', 'security through obscurity', 'FIPS 140-3'],
  },

  // ── Domain 4 ──────────────────────────────────────────────────────────────
  {
    id: 'dmz-public-web-server',
    domainId: 'd4',
    title: { en: 'Where to put the public web server', vi: 'Đặt web server công khai ở đâu' },
    situation: {
      en: 'Your company will host a public website whose web server needs to query an internal customer database. The network team plans to put the web server on the internal LAN and forward port 443 from the internet to it.',
      vi: 'Công ty bạn sẽ host một website công khai, trong đó web server cần truy vấn database khách hàng nội bộ. Team network định đặt web server trong mạng LAN nội bộ và forward cổng 443 từ internet vào.',
    },
    question: { en: 'Which design is BEST?', vi: 'Thiết kế nào TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Keep the plan but harden the web server and enable its host firewall.', vi: 'Giữ kế hoạch nhưng hardening web server và bật host firewall.' },
        why: {
          en: 'Hardening helps, but if the server is compromised the attacker is already inside the internal network.',
          vi: 'Hardening có ích, nhưng nếu server bị chiếm quyền thì kẻ tấn công đã ở ngay trong mạng nội bộ.',
        },
      },
      {
        id: 'B',
        text: { en: 'Place both the web server and the database in a DMZ.', vi: 'Đặt cả web server và database trong DMZ.' },
        why: {
          en: 'The database holds sensitive data and does not need to be reachable from the internet. Exposing it widens the attack surface.',
          vi: 'Database chứa dữ liệu nhạy cảm và không cần truy cập từ internet. Đưa nó ra DMZ làm tăng bề mặt tấn công.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Place the web server in a screened subnet (DMZ), allow only HTTPS in from the internet and only the database port from the web server to the internal database.',
          vi: 'Đặt web server trong screened subnet (DMZ), chỉ cho phép HTTPS từ internet vào và chỉ cho phép cổng database từ web server tới database nội bộ.',
        },
        why: {
          en: 'Correct. The DMZ isolates the exposed system, and tight rules on each side limit what an attacker can reach if the web server falls.',
          vi: 'Đúng. DMZ cô lập hệ thống công khai, và quy tắc chặt ở mỗi phía hạn chế những gì kẻ tấn công tiếp cận được nếu web server bị chiếm.',
        },
      },
      {
        id: 'D',
        text: { en: 'Put the web server directly on the internet with no firewall, as a hardened bastion host.', vi: 'Đặt web server trực tiếp ra internet không có firewall, như một bastion host đã hardening.' },
        why: {
          en: 'A bastion host is hardened, but removing the firewall gives up a layer, and the server would still need a path into the internal database.',
          vi: 'Bastion host được hardening, nhưng bỏ firewall là bỏ đi một lớp phòng thủ, và server vẫn cần đường vào database nội bộ.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'A screened subnet (DMZ) sits between the internet and the internal network, usually between two firewalls or on a third firewall interface. Public services live there; traffic from the DMZ into the internal network is allowed only for specific, necessary flows. This is defence in depth: perimeter firewall, segmentation, host hardening and application controls together.',
      vi: 'Screened subnet (DMZ) nằm giữa internet và mạng nội bộ, thường giữa hai firewall hoặc trên một interface thứ ba của firewall. Các dịch vụ công khai đặt ở đó; lưu lượng từ DMZ vào mạng nội bộ chỉ được phép với những luồng cụ thể, cần thiết. Đây là phòng thủ chiều sâu: firewall biên, phân đoạn mạng, hardening máy chủ và kiểm soát ứng dụng kết hợp với nhau.',
    },
    takeaway: {
      en: 'Public-facing servers go in a DMZ. Allow only the flows that are needed in each direction.',
      vi: 'Máy chủ công khai đặt trong DMZ. Chỉ cho phép những luồng cần thiết theo từng chiều.',
    },
    concepts: ['DMZ', 'screened subnet', 'defence in depth', 'segmentation'],
  },
  {
    id: 'tacacs-device-admin',
    domainId: 'd4',
    title: { en: 'One admin password for 200 switches', vi: 'Một mật khẩu admin cho 200 switch' },
    situation: {
      en: 'Fifteen network engineers share one local "admin" account on 200 routers and switches. Auditors want individual accountability, the ability to stop junior engineers from changing routing configuration, and a log of every command entered.',
      vi: 'Mười lăm kỹ sư mạng dùng chung một tài khoản local "admin" trên 200 router và switch. Kiểm toán viên yêu cầu trách nhiệm giải trình cá nhân, khả năng ngăn kỹ sư junior thay đổi cấu hình routing, và log mọi lệnh được nhập.',
    },
    question: { en: 'Which solution fits BEST?', vi: 'Giải pháp nào phù hợp NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Rotate the shared admin password every month.', vi: 'Đổi mật khẩu admin dùng chung mỗi tháng.' },
        why: {
          en: 'A rotated shared password is still shared. It gives no individual accountability and no per-command control.',
          vi: 'Mật khẩu dùng chung dù được đổi vẫn là dùng chung. Không có trách nhiệm cá nhân và không kiểm soát được từng lệnh.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Centralise device administration with TACACS+, using individual accounts, command authorisation and command accounting.',
          vi: 'Tập trung quản trị thiết bị bằng TACACS+, dùng tài khoản riêng, phân quyền theo lệnh (command authorization) và ghi log lệnh (command accounting).',
        },
        why: {
          en: 'Correct. TACACS+ separates authentication, authorisation and accounting, can permit or deny individual commands per user, and encrypts the whole payload.',
          vi: 'Đúng. TACACS+ tách riêng xác thực, phân quyền và ghi log, có thể cho phép hoặc chặn từng lệnh theo người dùng, và mã hóa toàn bộ payload.',
        },
      },
      {
        id: 'C',
        text: { en: 'Use RADIUS for device logins.', vi: 'Dùng RADIUS cho việc đăng nhập thiết bị.' },
        why: {
          en: 'RADIUS gives individual logins, but it combines authentication and authorisation, encrypts only the password, and has no standard per-command authorisation.',
          vi: 'RADIUS cho phép đăng nhập riêng từng người, nhưng gộp xác thực và phân quyền, chỉ mã hóa mật khẩu, và không có phân quyền theo từng lệnh theo chuẩn.',
        },
      },
      {
        id: 'D',
        text: { en: 'Enable SNMPv3 on all devices.', vi: 'Bật SNMPv3 trên mọi thiết bị.' },
        why: {
          en: 'SNMPv3 secures monitoring and management traffic. It is not an administrator authentication and command control system.',
          vi: 'SNMPv3 bảo vệ lưu lượng giám sát và quản lý. Nó không phải hệ thống xác thực quản trị viên và kiểm soát lệnh.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'RADIUS (UDP) combines authentication and authorisation and encrypts only the password; it is common for network access such as VPN and Wi-Fi. TACACS+ (TCP 49) separates the three A\'s, encrypts the full body and supports per-command authorisation, which is why it is preferred for administering network devices. Diameter is the successor to RADIUS, used in mobile networks.',
      vi: 'RADIUS (UDP) gộp xác thực và phân quyền và chỉ mã hóa mật khẩu; thường dùng cho truy cập mạng như VPN, Wi-Fi. TACACS+ (TCP 49) tách riêng ba chữ A, mã hóa toàn bộ nội dung và hỗ trợ phân quyền theo từng lệnh, vì vậy được ưu tiên cho quản trị thiết bị mạng. Diameter là phiên bản kế nhiệm RADIUS, dùng trong mạng di động.',
    },
    takeaway: {
      en: 'Network access → RADIUS. Device administration with per-command control → TACACS+.',
      vi: 'Truy cập mạng → RADIUS. Quản trị thiết bị kiểm soát từng lệnh → TACACS+.',
    },
    concepts: ['TACACS+', 'RADIUS', 'AAA', 'accountability'],
  },

  // ── Domain 5 ──────────────────────────────────────────────────────────────
  {
    id: 'biometric-cer-far',
    domainId: 'd5',
    title: { en: 'Fingerprint readers for the data centre', vi: 'Đầu đọc vân tay cho trung tâm dữ liệu' },
    situation: {
      en: 'You are choosing fingerprint readers for a data centre entrance. Vendor A\'s crossover error rate (CER) is 3%. Vendor B\'s CER is 1%. Both products let you adjust the sensitivity.',
      vi: 'Bạn đang chọn đầu đọc vân tay cho cửa vào trung tâm dữ liệu. Tỷ lệ lỗi giao nhau (CER) của nhà cung cấp A là 3%. CER của nhà cung cấp B là 1%. Cả hai sản phẩm đều cho phép điều chỉnh độ nhạy.',
    },
    question: { en: 'Which choice is BEST?', vi: 'Lựa chọn nào TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Vendor A, tuned for the lowest false rejection rate.', vi: 'Nhà cung cấp A, chỉnh để tỷ lệ từ chối sai thấp nhất.' },
        why: {
          en: 'A higher CER means a less accurate device, and tuning for convenience lets more impostors in.',
          vi: 'CER cao hơn nghĩa là thiết bị kém chính xác hơn, và chỉnh theo hướng tiện lợi sẽ để nhiều kẻ mạo danh lọt vào hơn.',
        },
      },
      {
        id: 'B',
        text: { en: 'Vendor B, tuned for the lowest false rejection rate so staff are not delayed.', vi: 'Nhà cung cấp B, chỉnh để tỷ lệ từ chối sai thấp nhất cho nhân viên khỏi bị chậm.' },
        why: {
          en: 'Right device, wrong tuning. Lowering false rejections raises false acceptances, which is the dangerous error at a data centre.',
          vi: 'Đúng thiết bị nhưng sai cách chỉnh. Giảm từ chối sai sẽ tăng chấp nhận sai, vốn là lỗi nguy hiểm ở trung tâm dữ liệu.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Vendor B, tuned toward a lower false acceptance rate even if staff are sometimes rejected.',
          vi: 'Nhà cung cấp B, chỉnh theo hướng giảm tỷ lệ chấp nhận sai dù nhân viên đôi khi bị từ chối.',
        },
        why: {
          en: 'Correct. Lower CER means better overall accuracy, and in a high-security area you accept some inconvenience to keep impostors out.',
          vi: 'Đúng. CER thấp hơn nghĩa là độ chính xác tổng thể tốt hơn, và ở khu vực bảo mật cao bạn chấp nhận chút bất tiện để ngăn kẻ mạo danh.',
        },
      },
      {
        id: 'D',
        text: { en: 'Either vendor; the CER does not matter if you can adjust sensitivity.', vi: 'Nhà cung cấp nào cũng được; CER không quan trọng nếu chỉnh được độ nhạy.' },
        why: {
          en: 'Adjusting sensitivity only trades one error for the other. CER is the standard way to compare overall accuracy.',
          vi: 'Chỉnh độ nhạy chỉ đổi lỗi này lấy lỗi kia. CER là cách chuẩn để so sánh độ chính xác tổng thể.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'False rejection rate (FRR, Type I error) = a legitimate user is refused. False acceptance rate (FAR, Type II error) = an impostor is accepted. Raising sensitivity lowers FAR and raises FRR. The crossover error rate (CER, also EER) is where the two are equal; a lower CER means a more accurate system. In high-security settings, tune for a low FAR.',
      vi: 'Tỷ lệ từ chối sai (FRR, lỗi Type I) = người dùng hợp lệ bị từ chối. Tỷ lệ chấp nhận sai (FAR, lỗi Type II) = kẻ mạo danh được chấp nhận. Tăng độ nhạy làm giảm FAR và tăng FRR. Tỷ lệ lỗi giao nhau (CER, còn gọi là EER) là điểm hai tỷ lệ bằng nhau; CER thấp hơn nghĩa là hệ thống chính xác hơn. Ở môi trường bảo mật cao, hãy chỉnh để FAR thấp.',
    },
    takeaway: {
      en: 'Compare devices by CER (lower is better). Fear FAR: false accept lets the attacker in.',
      vi: 'So sánh thiết bị bằng CER (thấp hơn là tốt hơn). Sợ nhất FAR: chấp nhận sai là để kẻ tấn công vào.',
    },
    concepts: ['biometrics', 'FAR', 'FRR', 'CER'],
  },
  {
    id: 'mfa-factor-types',
    domainId: 'd5',
    title: { en: 'Is password plus PIN MFA?', vi: 'Mật khẩu cộng PIN có phải MFA?' },
    situation: {
      en: 'After a phishing incident, management requires multi-factor authentication for the VPN. IT proposes several options and wants the cheapest one that genuinely counts as MFA.',
      vi: 'Sau một sự cố phishing, lãnh đạo yêu cầu xác thực đa yếu tố cho VPN. IT đưa ra vài phương án và muốn chọn phương án rẻ nhất mà thực sự được tính là MFA.',
    },
    question: { en: 'Which option is true multi-factor authentication?', vi: 'Phương án nào là xác thực đa yếu tố thực sự?' },
    options: [
      {
        id: 'A',
        text: { en: 'Password plus a 6-digit PIN chosen by the user.', vi: 'Mật khẩu cộng mã PIN 6 số do người dùng tự đặt.' },
        why: {
          en: 'Both are something you know. Two secrets of the same type are still single-factor.',
          vi: 'Cả hai đều là thứ bạn biết. Hai bí mật cùng loại vẫn là xác thực một yếu tố.',
        },
      },
      {
        id: 'B',
        text: { en: 'Password plus answers to two security questions.', vi: 'Mật khẩu cộng câu trả lời cho hai câu hỏi bảo mật.' },
        why: {
          en: 'Security questions are also something you know, and the answers are often easy to research.',
          vi: 'Câu hỏi bảo mật cũng là thứ bạn biết, và câu trả lời thường dễ tìm ra.',
        },
      },
      {
        id: 'C',
        text: { en: 'Fingerprint plus face recognition.', vi: 'Vân tay cộng nhận diện khuôn mặt.' },
        why: {
          en: 'Both are something you are. Two biometrics are one factor type.',
          vi: 'Cả hai đều là thứ bạn là. Hai đặc điểm sinh trắc học vẫn là một loại yếu tố.',
        },
      },
      {
        id: 'D',
        text: { en: 'Password plus a FIDO2 hardware security key.', vi: 'Mật khẩu cộng khóa bảo mật phần cứng FIDO2.' },
        why: {
          en: 'Correct. Something you know plus something you have. FIDO2 keys are also phishing-resistant because they are bound to the real site.',
          vi: 'Đúng. Thứ bạn biết cộng thứ bạn có. Khóa FIDO2 còn chống được phishing vì gắn với đúng tên miền thật.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Authentication factor types: something you know (password, PIN), something you have (token, smart card, phone, security key), and something you are (biometrics). Location and behaviour are sometimes added as context. MFA requires two or more DIFFERENT types. After phishing, phishing-resistant methods such as FIDO2 or smart cards are stronger than SMS or app codes.',
      vi: 'Các loại yếu tố xác thực: thứ bạn biết (mật khẩu, PIN), thứ bạn có (token, smart card, điện thoại, khóa bảo mật), và thứ bạn là (sinh trắc học). Vị trí và hành vi đôi khi được thêm như thông tin ngữ cảnh. MFA yêu cầu hai loại yếu tố KHÁC NHAU trở lên. Sau sự cố phishing, các phương thức chống phishing như FIDO2 hoặc smart card mạnh hơn mã SMS hay mã từ ứng dụng.',
    },
    takeaway: {
      en: 'MFA = different factor types. Two passwords or two biometrics are not MFA.',
      vi: 'MFA = các loại yếu tố khác nhau. Hai mật khẩu hay hai sinh trắc học không phải MFA.',
    },
    concepts: ['MFA', 'authentication factors', 'FIDO2'],
  },

  // ── Domain 6 ──────────────────────────────────────────────────────────────
  {
    id: 'ntp-log-correlation',
    domainId: 'd6',
    title: { en: 'A download before the login', vi: 'Tải file trước cả khi đăng nhập' },
    situation: {
      en: 'After an intrusion, analysts rebuild the timeline from firewall, VPN, domain controller and web server logs in the SIEM. The events do not line up: a file download appears seven minutes before the VPN login that caused it.',
      vi: 'Sau một vụ xâm nhập, các chuyên viên dựng lại dòng thời gian từ log firewall, VPN, domain controller và web server trong SIEM. Các sự kiện không khớp nhau: một lượt tải file xuất hiện trước bảy phút so với lượt đăng nhập VPN đã gây ra nó.',
    },
    question: { en: 'Which control would MOST have prevented this problem?', vi: 'Biện pháp nào sẽ ngăn được vấn đề này NHIỀU NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Keep logs for longer.', vi: 'Lưu log lâu hơn.' },
        why: {
          en: 'The logs exist; the problem is that their timestamps disagree. Longer retention does not fix that.',
          vi: 'Log vẫn còn; vấn đề là timestamp của chúng không khớp. Lưu lâu hơn không giải quyết được điều đó.',
        },
      },
      {
        id: 'B',
        text: { en: 'Hash every log file to prove it was not altered.', vi: 'Tính hash mọi file log để chứng minh không bị sửa.' },
        why: {
          en: 'Hashing protects integrity, which matters for evidence, but it does not make clocks agree.',
          vi: 'Hash bảo vệ tính toàn vẹn, quan trọng cho chứng cứ, nhưng không làm đồng hồ các thiết bị khớp nhau.',
        },
      },
      {
        id: 'C',
        text: { en: 'Send logs from more devices to the SIEM.', vi: 'Gửi log từ nhiều thiết bị hơn vào SIEM.' },
        why: {
          en: 'More sources with unsynchronised clocks make correlation even harder.',
          vi: 'Thêm nguồn log mà đồng hồ không đồng bộ sẽ khiến việc tương quan còn khó hơn.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Synchronise all systems to an authoritative time source with NTP and record timestamps in a consistent time zone such as UTC.',
          vi: 'Đồng bộ mọi hệ thống với nguồn thời gian chuẩn bằng NTP và ghi timestamp theo một múi giờ thống nhất như UTC.',
        },
        why: {
          en: 'Correct. Correlation across sources depends on accurate, consistent time. Without it, timelines are unreliable in investigations and in court.',
          vi: 'Đúng. Tương quan giữa các nguồn phụ thuộc vào thời gian chính xác, thống nhất. Thiếu nó, dòng thời gian không đáng tin trong điều tra và trước tòa.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Log management basics: synchronised time (NTP), central collection (SIEM), protection of logs from tampering, retention set by policy and regulation, and regular review. Logs are detective controls; they are only useful if events from different systems can be put in the right order.',
      vi: 'Nền tảng quản lý log: thời gian đồng bộ (NTP), thu thập tập trung (SIEM), bảo vệ log khỏi bị sửa đổi, thời gian lưu theo chính sách và quy định, và rà soát thường xuyên. Log là biện pháp phát hiện (detective); chúng chỉ hữu ích khi sắp xếp được sự kiện từ các hệ thống khác nhau theo đúng thứ tự.',
    },
    takeaway: {
      en: 'No synchronised time, no reliable correlation. NTP first.',
      vi: 'Không đồng bộ thời gian thì không tương quan log được. NTP trước tiên.',
    },
    concepts: ['NTP', 'log management', 'SIEM', 'correlation'],
  },
  {
    id: 'vuln-scan-vs-pentest',
    domainId: 'd6',
    title: { en: 'Finding missing patches every week', vi: 'Tìm bản vá còn thiếu mỗi tuần' },
    situation: {
      en: 'The board wants assurance that missing patches and misconfigurations on 3,000 servers are found within a week of appearing. The budget covers one option this year.',
      vi: 'Hội đồng quản trị muốn đảm bảo rằng bản vá còn thiếu và cấu hình sai trên 3.000 máy chủ được phát hiện trong vòng một tuần kể từ khi xuất hiện. Ngân sách năm nay chỉ đủ cho một phương án.',
    },
    question: { en: 'Which option BEST meets this goal?', vi: 'Phương án nào đáp ứng mục tiêu này TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'One annual external penetration test.', vi: 'Một đợt penetration test từ bên ngoài mỗi năm.' },
        why: {
          en: 'A penetration test goes deep but runs once. A patch missed in February would wait until next year\'s test.',
          vi: 'Penetration test đi sâu nhưng chỉ chạy một lần. Bản vá bị thiếu từ tháng Hai sẽ phải đợi đến đợt test năm sau.',
        },
      },
      {
        id: 'B',
        text: { en: 'A red team exercise.', vi: 'Một đợt diễn tập red team.' },
        why: {
          en: 'Red teaming tests detection and response against a realistic adversary. It is not designed for broad, repeated coverage of every server.',
          vi: 'Red team kiểm tra khả năng phát hiện và phản ứng trước một đối thủ thực tế. Nó không được thiết kế để bao phủ rộng, lặp lại trên mọi máy chủ.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Authenticated vulnerability scanning of all servers at least weekly, with results tracked to remediation.',
          vi: 'Quét lỗ hổng có xác thực (authenticated) trên mọi máy chủ ít nhất mỗi tuần, theo dõi kết quả đến khi khắc phục xong.',
        },
        why: {
          en: 'Correct. Vulnerability scanning is broad, automated and repeatable, which is exactly what routine detection of missing patches needs.',
          vi: 'Đúng. Quét lỗ hổng có phạm vi rộng, tự động và lặp lại được, đúng với nhu cầu phát hiện bản vá thiếu thường xuyên.',
        },
      },
      {
        id: 'D',
        text: { en: 'A manual code review of the main application.', vi: 'Review mã nguồn thủ công cho ứng dụng chính.' },
        why: {
          en: 'Code review finds flaws in one application, not missing operating system patches across 3,000 servers.',
          vi: 'Code review tìm lỗi trong một ứng dụng, không phát hiện bản vá hệ điều hành bị thiếu trên 3.000 máy chủ.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'A vulnerability assessment finds and ranks weaknesses broadly and often; authenticated scans see far more than unauthenticated ones. A penetration test exploits weaknesses to prove impact and is done less often, such as yearly or after major changes, under written rules of engagement. They complement each other; pick the one that matches the goal in the question.',
      vi: 'Đánh giá lỗ hổng tìm và xếp hạng điểm yếu trên phạm vi rộng và thường xuyên; quét có xác thực thấy nhiều hơn hẳn quét không xác thực. Penetration test khai thác điểm yếu để chứng minh tác động và được thực hiện ít hơn, như hằng năm hoặc sau thay đổi lớn, theo rules of engagement bằng văn bản. Hai cách bổ trợ nhau; hãy chọn cách khớp với mục tiêu trong câu hỏi.',
    },
    takeaway: {
      en: 'Routine, broad detection → vulnerability scanning. Proving impact → penetration test.',
      vi: 'Phát hiện thường xuyên, diện rộng → quét lỗ hổng. Chứng minh tác động → penetration test.',
    },
    concepts: ['vulnerability assessment', 'penetration testing', 'authenticated scan'],
  },

  // ── Domain 7 ──────────────────────────────────────────────────────────────
  {
    id: 'emergency-change',
    domainId: 'd7',
    title: { en: 'A hotfix at 11 p.m. on Friday', vi: 'Bản vá khẩn lúc 11 giờ đêm thứ Sáu' },
    situation: {
      en: 'At 23:00 on Friday, the vendor of your VPN gateway publishes a hotfix for a flaw that is being actively exploited. The change advisory board (CAB) next meets on Tuesday. The on-call engineer wants to apply the fix now and "tell everyone on Monday".',
      vi: 'Lúc 23:00 thứ Sáu, nhà cung cấp VPN gateway phát hành bản vá khẩn cho một lỗ hổng đang bị khai thác thực tế. Hội đồng phê duyệt thay đổi (CAB) họp lần tới vào thứ Ba. Kỹ sư trực muốn áp dụng bản vá ngay và "báo mọi người vào thứ Hai".',
    },
    question: { en: 'What should happen?', vi: 'Nên xử lý thế nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Wait for Tuesday\'s CAB meeting.', vi: 'Đợi cuộc họp CAB thứ Ba.' },
        why: {
          en: 'Leaving an actively exploited flaw open for four days is an unreasonable risk when an emergency path exists.',
          vi: 'Để lỗ hổng đang bị khai thác mở thêm bốn ngày là rủi ro không hợp lý khi đã có quy trình khẩn cấp.',
        },
      },
      {
        id: 'B',
        text: { en: 'Apply it now and document it afterwards, as the engineer suggests.', vi: 'Áp dụng ngay và ghi lại sau, như kỹ sư đề xuất.' },
        why: {
          en: 'Skipping approval breaks change control. If the hotfix causes an outage, nobody authorised the risk.',
          vi: 'Bỏ qua phê duyệt là phá vỡ kiểm soát thay đổi. Nếu bản vá gây sự cố, không ai đã phê duyệt rủi ro đó.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Use the emergency change process: get approval from the designated emergency approver, test as far as time allows, apply, then document and review at the next CAB.',
          vi: 'Dùng quy trình thay đổi khẩn cấp: xin phê duyệt từ người duyệt khẩn cấp được chỉ định, kiểm thử trong phạm vi thời gian cho phép, áp dụng, rồi ghi lại và rà soát tại cuộc họp CAB kế tiếp.',
        },
        why: {
          en: 'Correct. Emergency changes move fast but still need authorisation, a rollback plan and a record. Speed does not remove control.',
          vi: 'Đúng. Thay đổi khẩn cấp đi nhanh nhưng vẫn cần phê duyệt, kế hoạch rollback và hồ sơ. Tốc độ không loại bỏ kiểm soát.',
        },
      },
      {
        id: 'D',
        text: { en: 'Shut the VPN down until Tuesday without telling the business.', vi: 'Tắt VPN đến thứ Ba mà không báo bộ phận kinh doanh.' },
        why: {
          en: 'Cutting remote access is a business-impacting decision that must be made by management, not silently by IT.',
          vi: 'Cắt truy cập từ xa là quyết định ảnh hưởng đến kinh doanh, phải do lãnh đạo đưa ra, không phải IT tự làm âm thầm.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Change management typically runs: request, impact assessment, approval, build and test, notification, implementation, validation, and documentation of the new baseline. Organisations define an emergency path with a smaller set of approvers, but every emergency change is still approved, recorded and reviewed afterwards. Patch management follows the same idea: evaluate, test, approve, deploy, verify.',
      vi: 'Quản lý thay đổi thường gồm: yêu cầu, đánh giá tác động, phê duyệt, xây dựng và kiểm thử, thông báo, triển khai, xác nhận, và ghi lại baseline mới. Tổ chức định nghĩa quy trình khẩn cấp với ít người duyệt hơn, nhưng mọi thay đổi khẩn cấp vẫn phải được phê duyệt, ghi lại và rà soát sau đó. Quản lý bản vá theo cùng tinh thần: đánh giá, kiểm thử, phê duyệt, triển khai, xác minh.',
    },
    takeaway: {
      en: 'Emergency changes are faster, not unapproved. Never "change now, document later".',
      vi: 'Thay đổi khẩn cấp là nhanh hơn, không phải không cần duyệt. Không bao giờ "sửa trước, ghi sau".',
    },
    concepts: ['change management', 'emergency change', 'patch management'],
  },
  {
    id: 'dr-test-progression',
    domainId: 'd7',
    title: { en: 'Testing a brand-new DR plan', vi: 'Kiểm thử kế hoạch DR mới toanh' },
    situation: {
      en: 'Your team has just finished writing a disaster recovery plan. It has never been tested. The CIO wants to prove it works by cutting production over to the DR site next Saturday.',
      vi: 'Team của bạn vừa viết xong kế hoạch khôi phục thảm họa (DR). Kế hoạch chưa từng được kiểm thử. CIO muốn chứng minh nó hoạt động bằng cách chuyển toàn bộ production sang site DR vào thứ Bảy tới.',
    },
    question: { en: 'What should you recommend FIRST?', vi: 'Bạn nên đề xuất gì ĐẦU TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Run the full interruption test on Saturday as the CIO wants.', vi: 'Chạy full interruption test vào thứ Bảy như CIO muốn.' },
        why: {
          en: 'An untested plan used for a real cutover can cause the very outage it is meant to prevent.',
          vi: 'Dùng kế hoạch chưa kiểm thử để chuyển đổi thật có thể gây ra chính sự cố mà nó định ngăn chặn.',
        },
      },
      {
        id: 'B',
        text: { en: 'A parallel test that brings up the DR site alongside production.', vi: 'Parallel test, khởi động site DR song song với production.' },
        why: {
          en: 'Safer than a full cutover, but still a large step for a plan whose basic steps have never been checked.',
          vi: 'An toàn hơn chuyển đổi toàn phần, nhưng vẫn là bước lớn với một kế hoạch mà các bước cơ bản chưa từng được kiểm tra.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'A read-through and a structured walk-through with the people named in the plan.',
          vi: 'Đọc rà soát (read-through) và diễn tập trên giấy (structured walk-through) với những người có tên trong kế hoạch.',
        },
        why: {
          en: 'Correct. Start with tests that have no impact on operations, fix the gaps they reveal, then move up to simulation, parallel and full interruption.',
          vi: 'Đúng. Bắt đầu với các bài kiểm thử không ảnh hưởng vận hành, sửa các lỗ hổng phát hiện được, rồi mới nâng dần lên simulation, parallel và full interruption.',
        },
      },
      {
        id: 'D',
        text: { en: 'Skip testing. The plan was approved by management.', vi: 'Bỏ qua kiểm thử. Kế hoạch đã được lãnh đạo phê duyệt.' },
        why: {
          en: 'Approval does not show the plan works. Untested plans fail in real disasters.',
          vi: 'Phê duyệt không chứng minh kế hoạch hoạt động. Kế hoạch chưa kiểm thử sẽ thất bại khi có thảm họa thật.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'DR test types from least to most disruptive: read-through (checklist), structured walk-through (tabletop), simulation, parallel test, and full interruption. Each level builds confidence for the next. Full interruption is the most realistic but carries the risk of a real outage, so it needs earlier tests to pass and senior management approval.',
      vi: 'Các loại kiểm thử DR từ ít đến nhiều gián đoạn nhất: read-through (checklist), structured walk-through (tabletop), simulation, parallel test và full interruption. Mỗi mức tạo niềm tin cho mức tiếp theo. Full interruption thực tế nhất nhưng có nguy cơ gây sự cố thật, nên cần các bài kiểm thử trước đó đạt yêu cầu và lãnh đạo cấp cao phê duyệt.',
    },
    takeaway: {
      en: 'Read-through → walk-through → simulation → parallel → full interruption. Never start at the top.',
      vi: 'Read-through → walk-through → simulation → parallel → full interruption. Không bao giờ bắt đầu từ mức cao nhất.',
    },
    concepts: ['DR testing', 'tabletop', 'parallel test', 'full interruption'],
  },

  // ── Domain 8 ──────────────────────────────────────────────────────────────
  {
    id: 'polyinstantiation-inference',
    domainId: 'd8',
    title: { en: 'Two records for one ship', vi: 'Hai bản ghi cho một con tàu' },
    situation: {
      en: 'A defence logistics database tracks ship movements. The real destination of the ship "Orion" is Secret. If its row were simply hidden from Unclassified users, they would notice a missing ship and guess that something sensitive is happening. So the database stores a second row with the same key, labelled Unclassified, showing the destination as "Training exercise".',
      vi: 'Một database hậu cần quốc phòng theo dõi lịch trình tàu. Điểm đến thật của tàu "Orion" là Secret. Nếu chỉ ẩn bản ghi khỏi người dùng Unclassified, họ sẽ nhận ra thiếu một con tàu và đoán rằng có điều gì nhạy cảm. Vì vậy database lưu thêm một bản ghi thứ hai cùng khóa, gắn nhãn Unclassified, ghi điểm đến là "Diễn tập huấn luyện".',
    },
    question: { en: 'What technique is this, and what does it protect against?', vi: 'Đây là kỹ thuật gì, và nó chống lại điều gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Polyinstantiation, to prevent inference.', vi: 'Polyinstantiation, để chống suy luận (inference).' },
        why: {
          en: 'Correct. Polyinstantiation keeps several versions of the same record at different classification levels so lower-level users cannot deduce higher-level facts.',
          vi: 'Đúng. Polyinstantiation giữ nhiều phiên bản của cùng một bản ghi ở các mức phân loại khác nhau để người dùng mức thấp không suy ra được thông tin mức cao.',
        },
      },
      {
        id: 'B',
        text: { en: 'Aggregation control, to prevent aggregation.', vi: 'Kiểm soát tổng hợp, để chống tổng hợp dữ liệu (aggregation).' },
        why: {
          en: 'Aggregation is combining many low-sensitivity items into something sensitive. The defence here is a duplicate record, not limits on combining data.',
          vi: 'Aggregation là ghép nhiều dữ liệu ít nhạy cảm thành thông tin nhạy cảm. Cách phòng thủ ở đây là bản ghi trùng khóa, không phải giới hạn việc ghép dữ liệu.',
        },
      },
      {
        id: 'C',
        text: { en: 'Encryption at rest, to prevent disclosure.', vi: 'Mã hóa dữ liệu lưu trữ, để chống lộ dữ liệu.' },
        why: {
          en: 'Encryption protects stored data from people without keys. Authorised database users would still see the gap.',
          vi: 'Mã hóa bảo vệ dữ liệu lưu trữ khỏi người không có khóa. Người dùng database hợp lệ vẫn thấy chỗ trống.',
        },
      },
      {
        id: 'D',
        text: { en: 'Normalisation, to prevent redundancy.', vi: 'Chuẩn hóa (normalisation), để tránh dư thừa dữ liệu.' },
        why: {
          en: 'Normalisation removes duplicate data for design quality. This technique deliberately adds a duplicate.',
          vi: 'Chuẩn hóa loại bỏ dữ liệu trùng lặp để thiết kế tốt hơn. Kỹ thuật này lại cố ý thêm bản trùng.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Inference = deducing sensitive information from data you are allowed to see. Aggregation = combining several less sensitive pieces to produce something more sensitive. Defences include polyinstantiation (cover records at lower levels), cell suppression, noise and perturbation, views and context-dependent access control.',
      vi: 'Inference = suy ra thông tin nhạy cảm từ dữ liệu mà bạn được phép xem. Aggregation = ghép nhiều mảnh ít nhạy cảm để tạo ra thông tin nhạy cảm hơn. Các biện pháp phòng thủ gồm polyinstantiation (bản ghi che giấu ở mức thấp hơn), cell suppression, thêm nhiễu (noise/perturbation), view và kiểm soát truy cập theo ngữ cảnh.',
    },
    takeaway: {
      en: 'Polyinstantiation = same key, different classification levels, used against inference.',
      vi: 'Polyinstantiation = cùng khóa, khác mức phân loại, dùng để chống inference.',
    },
    concepts: ['polyinstantiation', 'inference', 'aggregation', 'database security'],
  },
  {
    id: 'pipeline-separation-of-duties',
    domainId: 'd8',
    title: { en: 'Straight from laptop to production', vi: 'Thẳng từ laptop lên production' },
    situation: {
      en: 'A startup has grown to 60 developers. Any developer can merge to the main branch, and the pipeline deploys straight to production. A developer "temporarily" disabled the payment fraud checks, and nobody noticed for two weeks.',
      vi: 'Một startup đã có 60 lập trình viên. Lập trình viên nào cũng có thể merge vào nhánh main, và pipeline triển khai thẳng lên production. Một lập trình viên đã "tạm thời" tắt kiểm tra gian lận thanh toán, và hai tuần sau mới có người phát hiện.',
    },
    question: { en: 'Which control BEST addresses this?', vi: 'Biện pháp nào xử lý vấn đề này TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Run SAST on every build.', vi: 'Chạy SAST cho mọi bản build.' },
        why: {
          en: 'SAST looks for insecure coding patterns. Turning off a business check is a deliberate logic change it will not flag.',
          vi: 'SAST tìm các mẫu lập trình không an toàn. Tắt một bước kiểm tra nghiệp vụ là thay đổi logic có chủ đích mà SAST sẽ không báo.',
        },
      },
      {
        id: 'B',
        text: { en: 'Ask developers to sign an acceptable use policy.', vi: 'Yêu cầu lập trình viên ký chính sách sử dụng chấp nhận được (AUP).' },
        why: {
          en: 'A signed policy sets expectations but does not stop or detect the change.',
          vi: 'Chính sách đã ký đặt ra kỳ vọng nhưng không ngăn chặn hay phát hiện được thay đổi.',
        },
      },
      {
        id: 'C',
        text: { en: 'Commission an annual penetration test of the payment flow.', vi: 'Thuê pentest luồng thanh toán mỗi năm một lần.' },
        why: {
          en: 'A yearly test might catch it months later. The gap is in how changes reach production.',
          vi: 'Kiểm thử hằng năm có thể phát hiện sau nhiều tháng. Lỗ hổng nằm ở cách thay đổi được đưa lên production.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Require approval from a reviewer other than the author before merge, enforced by branch protection, so every production change is reviewed and traceable.',
          vi: 'Bắt buộc người review khác tác giả phê duyệt trước khi merge, thực thi bằng branch protection, để mọi thay đổi lên production đều được review và truy vết được.',
        },
        why: {
          en: 'Correct. This builds separation of duties and change control into the pipeline: no single person can both write and release a change.',
          vi: 'Đúng. Cách này đưa phân tách nhiệm vụ và kiểm soát thay đổi vào pipeline: không ai vừa viết vừa tự phát hành thay đổi một mình.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Separation of duties means no single person controls a sensitive process end to end. In DevSecOps it shows up as mandatory peer review, protected branches, signed commits, pipeline approvals and restricted production access. It works alongside automated testing and change management, not instead of them.',
      vi: 'Phân tách nhiệm vụ nghĩa là không ai một mình kiểm soát toàn bộ một quy trình nhạy cảm. Trong DevSecOps, nó thể hiện qua review bắt buộc, nhánh được bảo vệ, commit có chữ ký, phê duyệt trong pipeline và hạn chế quyền truy cập production. Nó đi cùng kiểm thử tự động và quản lý thay đổi, không thay thế chúng.',
    },
    takeaway: {
      en: 'The person who writes a change should not be the only one who approves it.',
      vi: 'Người viết thay đổi không nên là người duy nhất phê duyệt nó.',
    },
    concepts: ['separation of duties', 'change control', 'DevSecOps', 'code review'],
  },
];
