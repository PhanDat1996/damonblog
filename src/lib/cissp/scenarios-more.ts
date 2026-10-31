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
      vi: 'Công ty bạn định outsource khâu tính lương cho một cloud provider. Team security tham gia cả trước lẫn sau khi ký hợp đồng.',
    },
    question: { en: 'Which activity is an example of due diligence?', vi: 'Việc nào là ví dụ của due diligence?' },
    options: [
      {
        id: 'A',
        text: {
          en: 'Reviewing the provider\'s SOC 2 Type II report, breach history and financial stability before signing.',
          vi: 'Xem SOC 2 Type II report, lịch sử breach và tình hình tài chính của provider trước khi ký.',
        },
        why: {
          en: 'Correct. Due diligence is the research and investigation you do to understand the risk before making a decision.',
          vi: 'Đúng. Due diligence là tìm hiểu, điều tra để nắm được risk trước khi ra quyết định.',
        },
      },
      {
        id: 'B',
        text: { en: 'Enabling SSO and MFA for the payroll application after go-live.', vi: 'Bật SSO và MFA cho ứng dụng tính lương sau khi go-live.' },
        why: {
          en: 'This is due care: implementing a reasonable control once the decision has been made.',
          vi: 'Đây là due care: triển khai control hợp lý sau khi đã quyết.',
        },
      },
      {
        id: 'C',
        text: { en: 'Training payroll staff on the new data-handling procedure.', vi: 'Đào tạo nhân viên bộ phận lương về quy trình xử lý dữ liệu mới.' },
        why: {
          en: 'Training is acting on what you know, so it is due care.',
          vi: 'Đào tạo là hành động dựa trên những gì mình đã biết, nên thuộc due care.',
        },
      },
      {
        id: 'D',
        text: { en: 'Encrypting the payroll export files sent to the bank.', vi: 'Mã hóa các file lương export gửi sang ngân hàng.' },
        why: {
          en: 'Applying encryption is implementing a safeguard, which is due care.',
          vi: 'Nhầm sang due care. Mã hóa là triển khai một safeguard.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Due diligence = knowing: investigation, assessment and planning that happen before and around a decision (vendor assessments, background checks, risk assessments). Due care = doing: what a prudent person would do to protect assets once the decision is made (implementing controls, patching, training). Failing to exercise due care is negligence and creates liability for management.',
      vi: 'Due diligence = biết: điều tra, đánh giá, lên kế hoạch trước và quanh một quyết định (đánh giá vendor, kiểm tra lý lịch, risk assessment). Due care = làm: những gì một người cẩn trọng sẽ làm để bảo vệ tài sản sau khi đã quyết (triển khai control, patch, đào tạo). Không làm due care là cẩu thả (negligence), và ban lãnh đạo sẽ phải chịu trách nhiệm pháp lý.',
    },
    takeaway: {
      en: 'Diligence = investigate first. Care = act reasonably after.',
      vi: 'Diligence = điều tra trước. Care = làm cho đàng hoàng sau.',
    },
    concepts: ['due diligence', 'due care', 'prudent person rule', 'third-party risk'],
  },
  {
    id: 'risk-acceptance-sign-off',
    domainId: 'd1',
    title: { en: 'A legacy system nobody can replace', vi: 'Hệ thống cũ không ai thay nổi' },
    situation: {
      en: 'A penetration test found that a production-line control application runs on an unsupported operating system. Replacing it would cost $1.2 million and the original vendor has gone out of business. The plant\'s vice president says "we will live with it". The IT manager suggests leaving it out of the audit report to avoid a finding.',
      vi: 'Đợt pentest phát hiện ứng dụng điều khiển dây chuyền sản xuất đang chạy trên hệ điều hành đã hết hỗ trợ. Thay thì tốn $1,2 triệu, mà vendor gốc đã phá sản. Phó giám đốc nhà máy bảo "thôi sống chung với nó". IT manager thì gợi ý bỏ nó ra khỏi audit report cho khỏi dính finding.',
    },
    question: { en: 'What is the BEST way to handle this risk?', vi: 'Xử lý risk này thế nào là TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Leave it out of the report, as the IT manager suggests.', vi: 'Bỏ ra khỏi report như IT manager gợi ý.' },
        why: {
          en: 'Hiding a known risk is ignoring it, not accepting it. It removes management\'s ability to make an informed decision and is an ethics problem.',
          vi: 'Giấu risk đã biết là lờ nó đi, chứ không phải chấp nhận nó. Ban lãnh đạo mất cơ hội quyết định khi có đủ thông tin, mà đây còn là vấn đề đạo đức.',
        },
      },
      {
        id: 'B',
        text: { en: 'The security manager formally accepts the risk on the company\'s behalf.', vi: 'Security manager đứng ra chấp nhận risk thay cho công ty.' },
        why: {
          en: 'Security advises; it does not own business risk. Acceptance must come from the accountable business owner or senior management.',
          vi: 'Sai người. Security chỉ tư vấn, không sở hữu risk kinh doanh. Chấp nhận risk phải là business owner chịu trách nhiệm hoặc ban lãnh đạo.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Record it in the risk register, apply compensating controls such as network isolation, and have the accountable executive sign off on the residual risk with a review date.',
          vi: 'Ghi vào risk register, áp compensating control như cô lập mạng, rồi để lãnh đạo chịu trách nhiệm ký chấp nhận residual risk, kèm ngày review lại.',
        },
        why: {
          en: 'Correct. Mitigate what you reasonably can, then let the risk owner make a documented, informed acceptance of what remains and revisit it periodically.',
          vi: 'Đúng. Giảm được tới đâu thì làm tới đó, phần còn lại để risk owner chấp nhận khi đã hiểu rõ, có văn bản, và định kỳ xem lại.',
        },
      },
      {
        id: 'D',
        text: { en: 'Shut the production line down until the application is replaced.', vi: 'Dừng dây chuyền cho tới khi thay xong ứng dụng.' },
        why: {
          en: 'Avoidance is a valid response but here it is out of proportion to the risk and is a business decision security cannot impose.',
          vi: 'Quá tay. Avoid là một lựa chọn hợp lệ, nhưng ở đây không cân xứng với mức risk, mà đó cũng là quyết định kinh doanh, security không áp đặt được.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'The four risk responses are avoid, transfer, mitigate and accept. Acceptance is legitimate only when it is informed, documented and approved by someone with the authority to own the risk, usually senior management or the business owner. Risk that is not recorded has not been accepted, it has been ignored. Residual risk is what is left after controls, and it should fit within the organisation\'s risk appetite.',
      vi: 'Có bốn cách xử lý risk: avoid, transfer, mitigate và accept. Accept chỉ hợp lệ khi người quyết hiểu rõ risk, có ghi lại bằng văn bản, và người duyệt có thẩm quyền làm chủ risk đó, thường là ban lãnh đạo hoặc business owner. Risk không ghi lại thì chưa phải đã chấp nhận, mà là bị lờ đi. Residual risk là phần còn lại sau khi áp control, và phải nằm trong risk appetite của tổ chức.',
    },
    takeaway: {
      en: 'Ignoring is not accepting. Senior management owns and signs off residual risk.',
      vi: 'Lờ đi không phải là chấp nhận. Residual risk là của ban lãnh đạo, ban lãnh đạo ký.',
    },
    concepts: ['risk response', 'risk acceptance', 'residual risk', 'risk register'],
  },

  // ── Domain 2 ──────────────────────────────────────────────────────────────
  {
    id: 'gdpr-controller-processor',
    domainId: 'd2',
    title: { en: 'A breach at the newsletter vendor', vi: 'Vendor gửi newsletter bị breach' },
    situation: {
      en: 'A Vietnamese online shop sells to customers in Germany and France. It uses a US email-marketing SaaS to send newsletters; the contract says the vendor processes the data only on the shop\'s instructions. The vendor is breached and customer names and emails are exposed.',
      vi: 'Một shop online ở Việt Nam bán hàng cho khách ở Đức và Pháp. Shop dùng một SaaS email marketing của Mỹ để gửi newsletter; hợp đồng ghi rõ vendor chỉ xử lý dữ liệu theo chỉ đạo của shop. Vendor bị breach, lộ tên và email của khách hàng.',
    },
    question: { en: 'Under GDPR, which statement is correct?', vi: 'Theo GDPR, nhận định nào đúng?' },
    options: [
      {
        id: 'A',
        text: { en: 'GDPR does not apply because the shop is not based in the EU.', vi: 'GDPR không áp dụng vì shop không đặt ở EU.' },
        why: {
          en: 'GDPR applies to organisations outside the EU that offer goods or services to people in the EU.',
          vi: 'Sai. GDPR áp dụng cả với tổ chức ngoài EU nếu họ bán hàng hóa hay dịch vụ cho người ở EU.',
        },
      },
      {
        id: 'B',
        text: { en: 'The vendor is the controller, so the shop has no obligations.', vi: 'Vendor là controller, nên shop không có nghĩa vụ gì.' },
        why: {
          en: 'The vendor acts only on the shop\'s instructions, which makes it a processor, not a controller.',
          vi: 'Ngược vai. Vendor chỉ làm theo chỉ đạo của shop, nên là processor chứ không phải controller.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'The shop is the controller and stays accountable. The vendor, as processor, must inform the shop without undue delay, and the shop must notify the supervisory authority within 72 hours unless the breach is unlikely to put people at risk.',
          vi: 'Shop là controller và vẫn chịu trách nhiệm. Vendor là processor, phải báo cho shop ngay, không chậm trễ; còn shop phải báo cơ quan giám sát trong 72 giờ, trừ khi breach ít có khả năng gây risk cho người dùng.',
        },
        why: {
          en: 'Correct. The controller decides why and how personal data is processed and keeps accountability even when a processor handles the data.',
          vi: 'Đúng. Controller là bên quyết định xử lý dữ liệu cá nhân để làm gì và xử lý thế nào, và vẫn chịu trách nhiệm kể cả khi đã giao cho processor xử lý.',
        },
      },
      {
        id: 'D',
        text: { en: 'Only the vendor must deal with the breach because it happened on its systems.', vi: 'Chỉ vendor phải lo vụ breach vì nó xảy ra trên hệ thống của họ.' },
        why: {
          en: 'Where the breach happened does not move accountability. Outsourcing transfers tasks, not responsibility to the data subjects.',
          vi: 'Breach xảy ra ở đâu không làm trách nhiệm chuyển đi. Outsource là giao việc, chứ không giao trách nhiệm với chủ thể dữ liệu.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'GDPR roles: the data controller decides the purposes and means of processing; the data processor processes on the controller\'s behalf under a contract; the data subject is the person the data is about; a DPO is required in some cases. The controller notifies the supervisory authority within 72 hours of becoming aware of a breach, unless it is unlikely to result in a risk to individuals, and informs the individuals when the risk is high.',
      vi: 'Các vai trò trong GDPR: data controller quyết định mục đích và cách thức xử lý; data processor xử lý thay controller theo hợp đồng; data subject là người mà dữ liệu nói về; một số trường hợp bắt buộc phải có DPO. Controller phải báo cơ quan giám sát trong 72 giờ kể từ khi biết có breach, trừ khi breach ít có khả năng gây risk cho cá nhân, và phải báo cho chính những người bị ảnh hưởng nếu risk cao.',
    },
    takeaway: {
      en: 'Controller decides and stays accountable. Processor acts on instructions. 72 hours to notify the authority.',
      vi: 'Controller quyết và chịu trách nhiệm. Processor làm theo chỉ đạo. Có 72 giờ để báo cơ quan giám sát.',
    },
    concepts: ['GDPR', 'data controller', 'data processor', 'breach notification'],
  },
  {
    id: 'scoping-and-tailoring',
    domainId: 'd2',
    title: { en: 'A control baseline that does not quite fit', vi: 'Baseline control không vừa khít' },
    situation: {
      en: 'Your organisation adopts the NIST SP 800-53 moderate baseline for a new internal system. Several controls cover wireless access, but the system has no wireless components. One password-complexity control does not fit the system\'s passwordless FIDO2 login.',
      vi: 'Tổ chức bạn dùng baseline moderate của NIST SP 800-53 cho một hệ thống nội bộ mới. Có vài control về truy cập wireless, mà hệ thống này chẳng có thành phần wireless nào. Còn một control về độ phức tạp mật khẩu thì không hợp với kiểu đăng nhập passwordless bằng FIDO2 của hệ thống.',
    },
    question: { en: 'What is the correct way to apply the baseline?', vi: 'Áp baseline thế nào mới đúng?' },
    options: [
      {
        id: 'A',
        text: { en: 'Implement every control exactly as written.', vi: 'Triển khai đủ mọi control, đúng từng chữ.' },
        why: {
          en: 'Controls that do not apply waste money and effort, and forcing a password rule onto passwordless login could weaken the design.',
          vi: 'Máy móc quá. Control không áp dụng thì chỉ tốn tiền, tốn công, còn ép rule mật khẩu lên đăng nhập passwordless có khi làm thiết kế yếu đi.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Scope out the controls that do not apply, tailor the others to fit, and document the reasoning.',
          vi: 'Scope bỏ các control không áp dụng, tailor các control còn lại cho vừa, và ghi lại lý do.',
        },
        why: {
          en: 'Correct. Baselines are starting points. Scoping removes what is irrelevant, tailoring adjusts controls to the environment, and documentation lets auditors follow the decisions.',
          vi: 'Đúng. Baseline chỉ là điểm xuất phát. Scoping loại những gì không liên quan, tailoring chỉnh control cho hợp môi trường, còn tài liệu giúp auditor lần theo được các quyết định.',
        },
      },
      {
        id: 'C',
        text: { en: 'Drop the baseline and design controls from scratch.', vi: 'Bỏ baseline, tự thiết kế control từ đầu.' },
        why: {
          en: 'Throwing away a proven baseline loses coverage and makes compliance harder to show.',
          vi: 'Phí. Vứt một baseline đã được kiểm chứng thì mất độ bao phủ, mà chứng minh compliance cũng khó hơn.',
        },
      },
      {
        id: 'D',
        text: { en: 'Ask the auditors to waive the controls that are inconvenient.', vi: 'Nhờ auditor miễn cho các control bất tiện.' },
        why: {
          en: 'Auditors assess; they do not design your control set. "Inconvenient" is not a risk-based reason.',
          vi: 'Auditor đánh giá, chứ không thiết kế bộ control cho bạn. Mà "bất tiện" cũng không phải lý do dựa trên risk.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Scoping = deciding which baseline controls apply to your system. Tailoring = modifying the selected controls to match your mission and environment (including compensating controls and parameter values). Supplementation = adding controls beyond the baseline for extra risk. All three are expected and must be documented.',
      vi: 'Scoping = quyết định control nào trong baseline áp dụng cho hệ thống của bạn. Tailoring = chỉnh các control đã chọn cho khớp với sứ mệnh và môi trường (gồm cả compensating control và giá trị tham số). Supplementation = thêm control ngoài baseline khi risk cao hơn. Cả ba đều là chuyện bình thường, và đều phải ghi lại.',
    },
    takeaway: {
      en: 'Scope out what does not apply, tailor what does, supplement where risk is higher. Document it.',
      vi: 'Không áp dụng thì scope ra, áp dụng thì tailor, risk cao thì bổ sung. Và phải ghi lại.',
    },
    concepts: ['scoping', 'tailoring', 'baselines', 'NIST SP 800-53'],
  },

  // ── Domain 3 ──────────────────────────────────────────────────────────────
  {
    id: 'saas-shared-responsibility',
    domainId: 'd3',
    title: { en: '"Anyone with the link"', vi: '"Ai có link cũng xem được"' },
    situation: {
      en: 'Your company uses a SaaS CRM. An employee shared a customer report with a link set to "anyone with the link". A search engine indexed it and customer data was exposed. An executive says, "The vendor hosts it, so this is the vendor\'s problem."',
      vi: 'Công ty bạn dùng một CRM SaaS. Một nhân viên share báo cáo khách hàng bằng link để chế độ "ai có link cũng xem được". Search engine index link đó và dữ liệu khách hàng bị lộ ra ngoài. Một sếp bảo: "Vendor host hệ thống thì đây là chuyện của vendor."',
    },
    question: { en: 'Who is accountable for the exposed data?', vi: 'Ai phải chịu trách nhiệm (accountable) về dữ liệu bị lộ?' },
    options: [
      {
        id: 'A',
        text: { en: 'The SaaS vendor, because it hosts the application.', vi: 'Vendor SaaS, vì họ host ứng dụng.' },
        why: {
          en: 'The vendor secures the platform. It did not decide who could see the report; your user did.',
          vi: 'Vendor lo bảo mật nền tảng thôi. Ai được xem báo cáo là do người dùng bên bạn quyết định, không phải vendor.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Your company. Under SaaS the customer still owns its data, users, access and sharing settings.',
          vi: 'Công ty bạn. Dùng SaaS thì khách hàng vẫn nắm dữ liệu, user, phân quyền và cấu hình share.',
        },
        why: {
          en: 'Correct. In every cloud model the customer remains accountable for its data and for how its users configure access.',
          vi: 'Đúng. Mô hình cloud nào cũng vậy, khách hàng vẫn chịu trách nhiệm về dữ liệu của mình và về việc user của mình cấu hình truy cập ra sao.',
        },
      },
      {
        id: 'C',
        text: { en: 'Only the employee who created the link.', vi: 'Chỉ nhân viên đã tạo link.' },
        why: {
          en: 'The employee made the mistake, but the organisation is accountable for the policy, training and settings that allowed it.',
          vi: 'Chưa đủ. Nhân viên là người làm sai, nhưng tổ chức mới là bên chịu trách nhiệm về policy, đào tạo và cấu hình đã để lỗi đó xảy ra.',
        },
      },
      {
        id: 'D',
        text: { en: 'Nobody, because no system was hacked.', vi: 'Không ai cả, vì có hệ thống nào bị hack đâu.' },
        why: {
          en: 'A breach does not need an attacker. Unauthorised disclosure through misconfiguration is still a breach.',
          vi: 'Breach không cần có attacker. Dữ liệu bị lộ trái phép vì cấu hình sai thì vẫn là breach.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Shared responsibility: in IaaS the customer manages the OS, applications and data; in PaaS the provider also manages the OS and runtime; in SaaS the provider manages almost everything up to the application. In all three the customer is responsible for its data, identities and access configuration. You can outsource tasks, but accountability for your data stays with you.',
      vi: 'Shared responsibility: với IaaS, khách hàng tự lo OS, ứng dụng và dữ liệu. Với PaaS, provider lo thêm OS và runtime. Với SaaS, provider lo gần hết, tới tận tầng ứng dụng. Nhưng cả ba mô hình thì dữ liệu, identity và cấu hình truy cập vẫn là phần của khách hàng. Bạn thuê ngoài được công việc, chứ trách nhiệm về dữ liệu của mình thì không đẩy đi được.',
    },
    takeaway: {
      en: 'Cloud model changes who runs what. Your data is always your responsibility.',
      vi: 'Đổi mô hình cloud là đổi ai vận hành cái gì. Còn dữ liệu thì lúc nào cũng là trách nhiệm của bạn.',
    },
    concepts: ['shared responsibility', 'SaaS', 'cloud security', 'accountability'],
  },
  {
    id: 'kerckhoffs-secret-algorithm',
    domainId: 'd3',
    title: { en: 'An algorithm too secret to study', vi: 'Thuật toán "bí mật" không cho ai soi' },
    situation: {
      en: 'A vendor pitches a file-encryption product built on its own proprietary algorithm. The salesperson says it is safer than AES "because attackers cannot study an algorithm they have never seen".',
      vi: 'Một vendor chào sản phẩm mã hóa file chạy trên thuật toán độc quyền do họ tự làm. Sales nói nó an toàn hơn AES "vì attacker không thể phân tích một thuật toán họ chưa từng thấy".',
    },
    question: { en: 'How should you evaluate this claim?', vi: 'Bạn nên nhìn nhận lời quảng cáo này thế nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Accept it. Keeping the algorithm secret adds an extra layer of defence.', vi: 'Tin. Giữ bí mật thuật toán là thêm một lớp phòng thủ.' },
        why: {
          en: 'Secret algorithms get little expert review, and once reverse engineered they cannot be changed the way a key can.',
          vi: 'Nghe hợp lý nhưng ngược lại mới đúng. Thuật toán bí mật thì ít chuyên gia review, mà một khi bị reverse engineer thì không thay được như thay khóa.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Reject it. Prefer a published, peer-reviewed algorithm such as AES in a validated module; security should depend only on the key.',
          vi: 'Không tin. Nên chọn thuật toán công khai, đã qua peer review như AES, chạy trong module đã được validate; độ an toàn chỉ nên dựa vào khóa.',
        },
        why: {
          en: 'Correct. This is Kerckhoffs\'s principle: a cryptosystem should stay secure even if everything except the key is public.',
          vi: 'Đúng. Đây là nguyên lý Kerckhoffs: hệ mã vẫn phải an toàn kể cả khi mọi thứ trừ khóa đều bị công khai.',
        },
      },
      {
        id: 'C',
        text: { en: 'Accept it if the vendor\'s key length is longer than 256 bits.', vi: 'Tin, nếu khóa của vendor dài hơn 256 bit.' },
        why: {
          en: 'Key length means nothing if the algorithm itself is weak. A flawed design can be broken without trying every key.',
          vi: 'Khóa dài không cứu được thuật toán yếu. Thiết kế có lỗi thì bị phá mà chẳng cần thử hết các khóa.',
        },
      },
      {
        id: 'D',
        text: { en: 'Encrypt everything twice, once with AES and once with the vendor\'s algorithm.', vi: 'Mã hóa hai lần: một lần bằng AES, một lần bằng thuật toán của vendor.' },
        why: {
          en: 'This adds cost and complexity without fixing the problem, and double encryption gains less than expected because of meet-in-the-middle attacks.',
          vi: 'Tốn thêm chi phí và phức tạp mà không giải quyết gốc vấn đề. Mã hóa hai lần cũng không mạnh như mình tưởng vì có tấn công meet-in-the-middle.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Kerckhoffs\'s principle says the only secret should be the key. Open algorithms like AES, RSA and SHA-2 have survived years of public cryptanalysis. "Security through obscurity" is not a control you can rely on. When buying crypto, look for standard algorithms and independent validation such as FIPS 140-3.',
      vi: 'Nguyên lý Kerckhoffs: thứ duy nhất cần giữ bí mật là khóa. Các thuật toán mở như AES, RSA, SHA-2 đã trụ được qua nhiều năm bị cộng đồng phân tích công khai. Security through obscurity không phải control để dựa vào. Khi mua sản phẩm mã hóa, hãy tìm thuật toán chuẩn và chứng nhận độc lập như FIPS 140-3.',
    },
    takeaway: {
      en: 'Only the key should be secret. Avoid proprietary crypto.',
      vi: 'Chỉ khóa mới cần bí mật. Tránh crypto tự chế.',
    },
    concepts: ['Kerckhoffs\'s principle', 'security through obscurity', 'FIPS 140-3'],
  },

  // ── Domain 4 ──────────────────────────────────────────────────────────────
  {
    id: 'dmz-public-web-server',
    domainId: 'd4',
    title: { en: 'Where to put the public web server', vi: 'Web server public đặt ở đâu' },
    situation: {
      en: 'Your company will host a public website whose web server needs to query an internal customer database. The network team plans to put the web server on the internal LAN and forward port 443 from the internet to it.',
      vi: 'Công ty bạn sắp host một website public, web server cần query vào database khách hàng nội bộ. Team network định đặt web server ngay trong LAN nội bộ rồi forward port 443 từ internet vào.',
    },
    question: { en: 'Which design is BEST?', vi: 'Thiết kế nào TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Keep the plan but harden the web server and enable its host firewall.', vi: 'Giữ nguyên kế hoạch, chỉ hardening web server và bật host firewall.' },
        why: {
          en: 'Hardening helps, but if the server is compromised the attacker is already inside the internal network.',
          vi: 'Hardening thì tốt, nhưng server mà bị chiếm thì attacker đã đứng sẵn trong mạng nội bộ rồi.',
        },
      },
      {
        id: 'B',
        text: { en: 'Place both the web server and the database in a DMZ.', vi: 'Đưa cả web server lẫn database vào DMZ.' },
        why: {
          en: 'The database holds sensitive data and does not need to be reachable from the internet. Exposing it widens the attack surface.',
          vi: 'Thừa rủi ro. Database chứa dữ liệu nhạy cảm, không cần phải với tới từ internet. Đưa nó ra ngoài chỉ làm rộng attack surface.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Place the web server in a screened subnet (DMZ), allow only HTTPS in from the internet and only the database port from the web server to the internal database.',
          vi: 'Đặt web server trong screened subnet (DMZ), từ internet chỉ cho HTTPS vào, từ web server chỉ mở port database tới database nội bộ.',
        },
        why: {
          en: 'Correct. The DMZ isolates the exposed system, and tight rules on each side limit what an attacker can reach if the web server falls.',
          vi: 'Đúng. DMZ cô lập hệ thống phải phơi ra ngoài, và rule chặt ở mỗi phía giới hạn những gì attacker với tới được nếu web server bị chiếm.',
        },
      },
      {
        id: 'D',
        text: { en: 'Put the web server directly on the internet with no firewall, as a hardened bastion host.', vi: 'Đặt web server thẳng ra internet, không firewall, coi như bastion host đã hardening.' },
        why: {
          en: 'A bastion host is hardened, but removing the firewall gives up a layer, and the server would still need a path into the internal database.',
          vi: 'Bastion host thì có hardening thật, nhưng bỏ firewall là bỏ đi một lớp phòng thủ, mà server vẫn phải có đường vào database nội bộ.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'A screened subnet (DMZ) sits between the internet and the internal network, usually between two firewalls or on a third firewall interface. Public services live there; traffic from the DMZ into the internal network is allowed only for specific, necessary flows. This is defence in depth: perimeter firewall, segmentation, host hardening and application controls together.',
      vi: 'Screened subnet (DMZ) nằm giữa internet và mạng nội bộ, thường kẹp giữa hai firewall hoặc nằm trên interface thứ ba của firewall. Dịch vụ public đặt ở đây; traffic từ DMZ vào mạng nội bộ chỉ được mở cho đúng những luồng cụ thể, cần thiết. Đây là defence in depth: firewall biên, segmentation, hardening host và control ở tầng ứng dụng cùng chồng lên nhau.',
    },
    takeaway: {
      en: 'Public-facing servers go in a DMZ. Allow only the flows that are needed in each direction.',
      vi: 'Server public thì vào DMZ. Mỗi chiều chỉ mở đúng luồng cần thiết.',
    },
    concepts: ['DMZ', 'screened subnet', 'defence in depth', 'segmentation'],
  },
  {
    id: 'tacacs-device-admin',
    domainId: 'd4',
    title: { en: 'One admin password for 200 switches', vi: 'Một mật khẩu admin cho 200 switch' },
    situation: {
      en: 'Fifteen network engineers share one local "admin" account on 200 routers and switches. Auditors want individual accountability, the ability to stop junior engineers from changing routing configuration, and a log of every command entered.',
      vi: 'Mười lăm kỹ sư network xài chung một account local "admin" trên 200 router và switch. Auditor muốn có accountability cho từng người, chặn được kỹ sư junior sửa cấu hình routing, và có log từng lệnh đã gõ.',
    },
    question: { en: 'Which solution fits BEST?', vi: 'Giải pháp nào PHÙ HỢP NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Rotate the shared admin password every month.', vi: 'Đổi mật khẩu admin dùng chung mỗi tháng.' },
        why: {
          en: 'A rotated shared password is still shared. It gives no individual accountability and no per-command control.',
          vi: 'Đổi bao nhiêu lần thì vẫn là mật khẩu dùng chung. Không biết ai làm gì, cũng không kiểm soát được từng lệnh.',
        },
      },
      {
        id: 'B',
        text: {
          en: 'Centralise device administration with TACACS+, using individual accounts, command authorisation and command accounting.',
          vi: 'Quản trị thiết bị tập trung bằng TACACS+, mỗi người một account, có command authorization và command accounting.',
        },
        why: {
          en: 'Correct. TACACS+ separates authentication, authorisation and accounting, can permit or deny individual commands per user, and encrypts the whole payload.',
          vi: 'Đúng. TACACS+ tách riêng authentication, authorization và accounting, cho phép hoặc chặn từng lệnh theo từng user, và mã hóa toàn bộ payload.',
        },
      },
      {
        id: 'C',
        text: { en: 'Use RADIUS for device logins.', vi: 'Dùng RADIUS cho đăng nhập thiết bị.' },
        why: {
          en: 'RADIUS gives individual logins, but it combines authentication and authorisation, encrypts only the password, and has no standard per-command authorisation.',
          vi: 'Gần đúng thôi. RADIUS cho mỗi người login riêng, nhưng gộp authentication với authorization, chỉ mã hóa mật khẩu, và không có chuẩn phân quyền theo từng lệnh.',
        },
      },
      {
        id: 'D',
        text: { en: 'Enable SNMPv3 on all devices.', vi: 'Bật SNMPv3 trên toàn bộ thiết bị.' },
        why: {
          en: 'SNMPv3 secures monitoring and management traffic. It is not an administrator authentication and command control system.',
          vi: 'Lạc đề. SNMPv3 bảo vệ traffic giám sát và quản lý, chứ không phải hệ thống xác thực admin hay kiểm soát lệnh.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'RADIUS (UDP) combines authentication and authorisation and encrypts only the password; it is common for network access such as VPN and Wi-Fi. TACACS+ (TCP 49) separates the three A\'s, encrypts the full body and supports per-command authorisation, which is why it is preferred for administering network devices. Diameter is the successor to RADIUS, used in mobile networks.',
      vi: 'RADIUS (UDP) gộp authentication với authorization và chỉ mã hóa mật khẩu; hay dùng cho network access như VPN, Wi-Fi. TACACS+ (TCP 49) tách riêng ba chữ A, mã hóa toàn bộ body và hỗ trợ phân quyền theo từng lệnh, nên được chọn để quản trị thiết bị mạng. Diameter là bản kế nhiệm RADIUS, dùng trong mạng di động.',
    },
    takeaway: {
      en: 'Network access → RADIUS. Device administration with per-command control → TACACS+.',
      vi: 'Network access → RADIUS. Quản trị thiết bị, kiểm soát từng lệnh → TACACS+.',
    },
    concepts: ['TACACS+', 'RADIUS', 'AAA', 'accountability'],
  },

  // ── Domain 5 ──────────────────────────────────────────────────────────────
  {
    id: 'biometric-cer-far',
    domainId: 'd5',
    title: { en: 'Fingerprint readers for the data centre', vi: 'Chọn đầu đọc vân tay cho data center' },
    situation: {
      en: 'You are choosing fingerprint readers for a data centre entrance. Vendor A\'s crossover error rate (CER) is 3%. Vendor B\'s CER is 1%. Both products let you adjust the sensitivity.',
      vi: 'Bạn đang chọn đầu đọc vân tay cho cửa vào data center. Vendor A có crossover error rate (CER) 3%, vendor B có CER 1%. Cả hai đều cho chỉnh độ nhạy.',
    },
    question: { en: 'Which choice is BEST?', vi: 'Chọn thế nào là TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Vendor A, tuned for the lowest false rejection rate.', vi: 'Vendor A, chỉnh cho false rejection thấp nhất.' },
        why: {
          en: 'A higher CER means a less accurate device, and tuning for convenience lets more impostors in.',
          vi: 'Sai cả hai. CER cao hơn nghĩa là thiết bị kém chính xác hơn, mà còn chỉnh theo hướng tiện cho người dùng thì kẻ mạo danh càng dễ lọt.',
        },
      },
      {
        id: 'B',
        text: { en: 'Vendor B, tuned for the lowest false rejection rate so staff are not delayed.', vi: 'Vendor B, chỉnh cho false rejection thấp nhất để nhân viên khỏi phải chờ.' },
        why: {
          en: 'Right device, wrong tuning. Lowering false rejections raises false acceptances, which is the dangerous error at a data centre.',
          vi: 'Chọn đúng máy nhưng chỉnh sai. Giảm false rejection thì false acceptance tăng, mà ở data center đó mới là lỗi nguy hiểm.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Vendor B, tuned toward a lower false acceptance rate even if staff are sometimes rejected.',
          vi: 'Vendor B, chỉnh theo hướng giảm false acceptance, chấp nhận nhân viên đôi khi bị từ chối.',
        },
        why: {
          en: 'Correct. Lower CER means better overall accuracy, and in a high-security area you accept some inconvenience to keep impostors out.',
          vi: 'Đúng. CER thấp hơn thì tổng thể chính xác hơn, còn ở khu vực bảo mật cao thì chịu bất tiện một chút để chặn kẻ mạo danh.',
        },
      },
      {
        id: 'D',
        text: { en: 'Either vendor; the CER does not matter if you can adjust sensitivity.', vi: 'Vendor nào cũng được, chỉnh được độ nhạy thì CER không quan trọng.' },
        why: {
          en: 'Adjusting sensitivity only trades one error for the other. CER is the standard way to compare overall accuracy.',
          vi: 'Chỉnh độ nhạy chỉ là đổi lỗi này lấy lỗi kia thôi. Muốn so độ chính xác tổng thể thì CER là thước đo chuẩn.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'False rejection rate (FRR, Type I error) = a legitimate user is refused. False acceptance rate (FAR, Type II error) = an impostor is accepted. Raising sensitivity lowers FAR and raises FRR. The crossover error rate (CER, also EER) is where the two are equal; a lower CER means a more accurate system. In high-security settings, tune for a low FAR.',
      vi: 'False rejection rate (FRR, lỗi Type I) là người hợp lệ bị từ chối. False acceptance rate (FAR, lỗi Type II) là kẻ mạo danh được cho qua. Tăng độ nhạy thì FAR giảm, FRR tăng. Crossover error rate (CER, hay EER) là điểm hai tỷ lệ này bằng nhau; CER càng thấp thì hệ thống càng chính xác. Ở môi trường bảo mật cao, chỉnh cho FAR thấp.',
    },
    takeaway: {
      en: 'Compare devices by CER (lower is better). Fear FAR: false accept lets the attacker in.',
      vi: 'So thiết bị bằng CER (càng thấp càng tốt). Sợ nhất là FAR: chấp nhận nhầm là mở cửa cho attacker.',
    },
    concepts: ['biometrics', 'FAR', 'FRR', 'CER'],
  },
  {
    id: 'mfa-factor-types',
    domainId: 'd5',
    title: { en: 'Is password plus PIN MFA?', vi: 'Password cộng PIN có phải MFA không?' },
    situation: {
      en: 'After a phishing incident, management requires multi-factor authentication for the VPN. IT proposes several options and wants the cheapest one that genuinely counts as MFA.',
      vi: 'Sau một vụ phishing, ban lãnh đạo yêu cầu bật MFA cho VPN. IT đưa ra vài phương án và muốn chọn cái rẻ nhất mà vẫn thực sự là MFA.',
    },
    question: { en: 'Which option is true multi-factor authentication?', vi: 'Phương án nào mới đúng là MFA?' },
    options: [
      {
        id: 'A',
        text: { en: 'Password plus a 6-digit PIN chosen by the user.', vi: 'Password cộng mã PIN 6 số do người dùng tự đặt.' },
        why: {
          en: 'Both are something you know. Two secrets of the same type are still single-factor.',
          vi: 'Cả hai đều là thứ bạn biết. Hai bí mật cùng loại thì vẫn chỉ là một yếu tố.',
        },
      },
      {
        id: 'B',
        text: { en: 'Password plus answers to two security questions.', vi: 'Password cộng câu trả lời cho hai câu hỏi bảo mật.' },
        why: {
          en: 'Security questions are also something you know, and the answers are often easy to research.',
          vi: 'Câu hỏi bảo mật cũng là thứ bạn biết, mà câu trả lời thì thường tra ra được khá dễ.',
        },
      },
      {
        id: 'C',
        text: { en: 'Fingerprint plus face recognition.', vi: 'Vân tay cộng nhận diện khuôn mặt.' },
        why: {
          en: 'Both are something you are. Two biometrics are one factor type.',
          vi: 'Cả hai đều là thứ bạn là. Hai kiểu sinh trắc học vẫn chỉ tính là một loại yếu tố.',
        },
      },
      {
        id: 'D',
        text: { en: 'Password plus a FIDO2 hardware security key.', vi: 'Password cộng security key phần cứng FIDO2.' },
        why: {
          en: 'Correct. Something you know plus something you have. FIDO2 keys are also phishing-resistant because they are bound to the real site.',
          vi: 'Đúng. Thứ bạn biết cộng thứ bạn có. Key FIDO2 còn chống được phishing vì nó gắn với đúng domain thật.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Authentication factor types: something you know (password, PIN), something you have (token, smart card, phone, security key), and something you are (biometrics). Location and behaviour are sometimes added as context. MFA requires two or more DIFFERENT types. After phishing, phishing-resistant methods such as FIDO2 or smart cards are stronger than SMS or app codes.',
      vi: 'Có ba loại yếu tố xác thực: thứ bạn biết (password, PIN), thứ bạn có (token, smart card, điện thoại, security key) và thứ bạn là (sinh trắc học). Vị trí và hành vi đôi khi được dùng thêm làm ngữ cảnh. MFA phải có từ hai loại KHÁC NHAU trở lên. Sau một vụ phishing thì các phương thức chống phishing như FIDO2 hay smart card mạnh hơn mã SMS hoặc mã từ app.',
    },
    takeaway: {
      en: 'MFA = different factor types. Two passwords or two biometrics are not MFA.',
      vi: 'MFA = khác loại yếu tố. Hai password hay hai kiểu sinh trắc học đều không phải MFA.',
    },
    concepts: ['MFA', 'authentication factors', 'FIDO2'],
  },

  // ── Domain 6 ──────────────────────────────────────────────────────────────
  {
    id: 'ntp-log-correlation',
    domainId: 'd6',
    title: { en: 'A download before the login', vi: 'Tải file trước cả khi login' },
    situation: {
      en: 'After an intrusion, analysts rebuild the timeline from firewall, VPN, domain controller and web server logs in the SIEM. The events do not line up: a file download appears seven minutes before the VPN login that caused it.',
      vi: 'Sau một vụ xâm nhập, team analyst dựng lại timeline từ log firewall, VPN, domain controller và web server trong SIEM. Các event lệch nhau: một lượt tải file lại hiện ra trước bảy phút so với chính lần login VPN đã thực hiện nó.',
    },
    question: { en: 'Which control would MOST have prevented this problem?', vi: 'Control nào sẽ ngăn được vấn đề này NHIỀU NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Keep logs for longer.', vi: 'Giữ log lâu hơn.' },
        why: {
          en: 'The logs exist; the problem is that their timestamps disagree. Longer retention does not fix that.',
          vi: 'Log vẫn còn đủ, cái sai là timestamp giữa chúng không khớp. Retention dài hơn không sửa được chuyện đó.',
        },
      },
      {
        id: 'B',
        text: { en: 'Hash every log file to prove it was not altered.', vi: 'Hash mọi file log để chứng minh không bị sửa.' },
        why: {
          en: 'Hashing protects integrity, which matters for evidence, but it does not make clocks agree.',
          vi: 'Hash bảo vệ integrity, quan trọng khi dùng làm evidence, nhưng không làm đồng hồ các máy khớp nhau được.',
        },
      },
      {
        id: 'C',
        text: { en: 'Send logs from more devices to the SIEM.', vi: 'Đẩy log từ nhiều thiết bị hơn vào SIEM.' },
        why: {
          en: 'More sources with unsynchronised clocks make correlation even harder.',
          vi: 'Thêm nguồn mà đồng hồ vẫn lệch thì correlate còn khó hơn nữa.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Synchronise all systems to an authoritative time source with NTP and record timestamps in a consistent time zone such as UTC.',
          vi: 'Đồng bộ mọi hệ thống với một nguồn thời gian chuẩn qua NTP và ghi timestamp theo một múi giờ thống nhất, ví dụ UTC.',
        },
        why: {
          en: 'Correct. Correlation across sources depends on accurate, consistent time. Without it, timelines are unreliable in investigations and in court.',
          vi: 'Đúng. Muốn correlate nhiều nguồn thì thời gian phải chính xác và thống nhất. Không có cái đó thì timeline không đáng tin, cả khi điều tra lẫn khi ra tòa.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Log management basics: synchronised time (NTP), central collection (SIEM), protection of logs from tampering, retention set by policy and regulation, and regular review. Logs are detective controls; they are only useful if events from different systems can be put in the right order.',
      vi: 'Mấy cái căn bản của quản lý log: thời gian đồng bộ (NTP), gom log tập trung (SIEM), chống sửa log, retention theo policy và quy định, và review thường xuyên. Log là detective control, chỉ có ích khi xếp được event từ các hệ thống khác nhau theo đúng thứ tự.',
    },
    takeaway: {
      en: 'No synchronised time, no reliable correlation. NTP first.',
      vi: 'Giờ không đồng bộ thì đừng mong correlate. NTP trước đã.',
    },
    concepts: ['NTP', 'log management', 'SIEM', 'correlation'],
  },
  {
    id: 'vuln-scan-vs-pentest',
    domainId: 'd6',
    title: { en: 'Finding missing patches every week', vi: 'Tuần nào cũng phải tìm ra patch còn thiếu' },
    situation: {
      en: 'The board wants assurance that missing patches and misconfigurations on 3,000 servers are found within a week of appearing. The budget covers one option this year.',
      vi: 'Board muốn chắc rằng patch còn thiếu và cấu hình sai trên 3.000 server sẽ bị phát hiện trong vòng một tuần kể từ lúc xuất hiện. Ngân sách năm nay chỉ đủ cho một phương án.',
    },
    question: { en: 'Which option BEST meets this goal?', vi: 'Phương án nào đáp ứng mục tiêu này TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'One annual external penetration test.', vi: 'Mỗi năm một đợt external pentest.' },
        why: {
          en: 'A penetration test goes deep but runs once. A patch missed in February would wait until next year\'s test.',
          vi: 'Pentest đào sâu nhưng một năm có một lần. Patch bị thiếu từ tháng Hai thì phải đợi tới đợt test năm sau.',
        },
      },
      {
        id: 'B',
        text: { en: 'A red team exercise.', vi: 'Một đợt red team.' },
        why: {
          en: 'Red teaming tests detection and response against a realistic adversary. It is not designed for broad, repeated coverage of every server.',
          vi: 'Red team kiểm tra khả năng phát hiện và phản ứng trước một đối thủ thực tế. Nó không sinh ra để quét rộng, lặp đi lặp lại trên từng server.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Authenticated vulnerability scanning of all servers at least weekly, with results tracked to remediation.',
          vi: 'Authenticated vulnerability scan toàn bộ server ít nhất mỗi tuần, theo dõi kết quả tới khi remediate xong.',
        },
        why: {
          en: 'Correct. Vulnerability scanning is broad, automated and repeatable, which is exactly what routine detection of missing patches needs.',
          vi: 'Đúng. Vulnerability scan phủ rộng, tự động và lặp lại được, đúng thứ cần để bắt patch thiếu đều đặn.',
        },
      },
      {
        id: 'D',
        text: { en: 'A manual code review of the main application.', vi: 'Code review thủ công cho ứng dụng chính.' },
        why: {
          en: 'Code review finds flaws in one application, not missing operating system patches across 3,000 servers.',
          vi: 'Code review tìm lỗi trong một ứng dụng, không phát hiện được patch hệ điều hành còn thiếu trên 3.000 server.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'A vulnerability assessment finds and ranks weaknesses broadly and often; authenticated scans see far more than unauthenticated ones. A penetration test exploits weaknesses to prove impact and is done less often, such as yearly or after major changes, under written rules of engagement. They complement each other; pick the one that matches the goal in the question.',
      vi: 'Vulnerability assessment tìm và xếp hạng điểm yếu trên diện rộng, làm thường xuyên; scan có authenticated thấy được nhiều hơn hẳn scan không đăng nhập. Pentest thì khai thác điểm yếu để chứng minh tác động, làm thưa hơn, ví dụ mỗi năm một lần hoặc sau thay đổi lớn, theo rules of engagement bằng văn bản. Hai cái bổ sung cho nhau; câu hỏi muốn đạt mục tiêu gì thì chọn cái khớp với mục tiêu đó.',
    },
    takeaway: {
      en: 'Routine, broad detection → vulnerability scanning. Proving impact → penetration test.',
      vi: 'Phát hiện đều đặn, diện rộng → vulnerability scan. Chứng minh tác động → pentest.',
    },
    concepts: ['vulnerability assessment', 'penetration testing', 'authenticated scan'],
  },

  // ── Domain 7 ──────────────────────────────────────────────────────────────
  {
    id: 'emergency-change',
    domainId: 'd7',
    title: { en: 'A hotfix at 11 p.m. on Friday', vi: 'Hotfix lúc 11 giờ đêm thứ Sáu' },
    situation: {
      en: 'At 23:00 on Friday, the vendor of your VPN gateway publishes a hotfix for a flaw that is being actively exploited. The change advisory board (CAB) next meets on Tuesday. The on-call engineer wants to apply the fix now and "tell everyone on Monday".',
      vi: '23:00 thứ Sáu, vendor của VPN gateway ra hotfix cho một lỗ hổng đang bị khai thác ngoài thực tế. Phải tới thứ Ba CAB mới họp. Kỹ sư trực muốn cài hotfix luôn rồi "thứ Hai báo mọi người sau".',
    },
    question: { en: 'What should happen?', vi: 'Nên xử lý thế nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Wait for Tuesday\'s CAB meeting.', vi: 'Chờ CAB họp thứ Ba.' },
        why: {
          en: 'Leaving an actively exploited flaw open for four days is an unreasonable risk when an emergency path exists.',
          vi: 'Quá chậm. Đã có quy trình khẩn cấp mà vẫn để lỗ hổng đang bị khai thác mở thêm bốn ngày là chấp nhận một risk vô lý.',
        },
      },
      {
        id: 'B',
        text: { en: 'Apply it now and document it afterwards, as the engineer suggests.', vi: 'Cài luôn rồi ghi lại sau, như kỹ sư trực đề xuất.' },
        why: {
          en: 'Skipping approval breaks change control. If the hotfix causes an outage, nobody authorised the risk.',
          vi: 'Bỏ qua phê duyệt là phá change control. Lỡ hotfix gây outage thì risk đó chưa hề có ai duyệt.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'Use the emergency change process: get approval from the designated emergency approver, test as far as time allows, apply, then document and review at the next CAB.',
          vi: 'Đi theo quy trình emergency change: xin người duyệt khẩn cấp đã chỉ định sẵn phê duyệt, test trong phạm vi thời gian cho phép, cài, rồi ghi lại và review ở buổi CAB kế tiếp.',
        },
        why: {
          en: 'Correct. Emergency changes move fast but still need authorisation, a rollback plan and a record. Speed does not remove control.',
          vi: 'Đúng. Emergency change đi nhanh nhưng vẫn phải có phê duyệt, kế hoạch rollback và hồ sơ. Nhanh không có nghĩa là bỏ control.',
        },
      },
      {
        id: 'D',
        text: { en: 'Shut the VPN down until Tuesday without telling the business.', vi: 'Tắt VPN tới thứ Ba mà không báo cho bên kinh doanh.' },
        why: {
          en: 'Cutting remote access is a business-impacting decision that must be made by management, not silently by IT.',
          vi: 'Không phải việc IT tự quyết. Cắt truy cập từ xa ảnh hưởng thẳng tới kinh doanh, nên ban lãnh đạo phải quyết, chứ IT không được lặng lẽ tự làm.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Change management typically runs: request, impact assessment, approval, build and test, notification, implementation, validation, and documentation of the new baseline. Organisations define an emergency path with a smaller set of approvers, but every emergency change is still approved, recorded and reviewed afterwards. Patch management follows the same idea: evaluate, test, approve, deploy, verify.',
      vi: 'Change management thường đi qua các bước: yêu cầu, đánh giá tác động, phê duyệt, build và test, thông báo, triển khai, kiểm tra lại, rồi ghi nhận baseline mới. Tổ chức thường quy định sẵn một luồng khẩn cấp với ít người duyệt hơn, nhưng change khẩn cấp nào cũng vẫn phải có người duyệt, có ghi lại và review sau đó. Patch management cũng cùng tinh thần: đánh giá, test, duyệt, deploy, kiểm tra.',
    },
    takeaway: {
      en: 'Emergency changes are faster, not unapproved. Never "change now, document later".',
      vi: 'Emergency change là duyệt nhanh hơn, không phải khỏi duyệt. Đừng bao giờ "sửa trước, ghi sau".',
    },
    concepts: ['change management', 'emergency change', 'patch management'],
  },
  {
    id: 'dr-test-progression',
    domainId: 'd7',
    title: { en: 'Testing a brand-new DR plan', vi: 'Test một DR plan mới tinh' },
    situation: {
      en: 'Your team has just finished writing a disaster recovery plan. It has never been tested. The CIO wants to prove it works by cutting production over to the DR site next Saturday.',
      vi: 'Team bạn vừa viết xong DR plan, chưa test lần nào. CIO muốn chứng minh plan chạy được bằng cách chuyển hẳn production sang DR site vào thứ Bảy tới.',
    },
    question: { en: 'What should you recommend FIRST?', vi: 'Bạn nên đề xuất gì TRƯỚC TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Run the full interruption test on Saturday as the CIO wants.', vi: 'Làm full interruption test vào thứ Bảy như CIO muốn.' },
        why: {
          en: 'An untested plan used for a real cutover can cause the very outage it is meant to prevent.',
          vi: 'Quá liều. Dùng một plan chưa test để chuyển đổi thật có khi lại gây ra đúng cái outage mà plan sinh ra để ngăn.',
        },
      },
      {
        id: 'B',
        text: { en: 'A parallel test that brings up the DR site alongside production.', vi: 'Parallel test: dựng DR site chạy song song với production.' },
        why: {
          en: 'Safer than a full cutover, but still a large step for a plan whose basic steps have never been checked.',
          vi: 'An toàn hơn chuyển hẳn, nhưng vẫn là bước quá lớn khi các bước cơ bản trong plan còn chưa ai kiểm tra.',
        },
      },
      {
        id: 'C',
        text: {
          en: 'A read-through and a structured walk-through with the people named in the plan.',
          vi: 'Read-through rồi structured walk-through với những người có tên trong plan.',
        },
        why: {
          en: 'Correct. Start with tests that have no impact on operations, fix the gaps they reveal, then move up to simulation, parallel and full interruption.',
          vi: 'Đúng. Bắt đầu bằng các kiểu test không đụng tới vận hành, sửa những chỗ hổng lộ ra, rồi mới lên dần simulation, parallel và full interruption.',
        },
      },
      {
        id: 'D',
        text: { en: 'Skip testing. The plan was approved by management.', vi: 'Khỏi test. Ban lãnh đạo đã duyệt plan rồi.' },
        why: {
          en: 'Approval does not show the plan works. Untested plans fail in real disasters.',
          vi: 'Duyệt rồi không có nghĩa là chạy được. Plan chưa test thì gặp thảm họa thật sẽ vỡ.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'DR test types from least to most disruptive: read-through (checklist), structured walk-through (tabletop), simulation, parallel test, and full interruption. Each level builds confidence for the next. Full interruption is the most realistic but carries the risk of a real outage, so it needs earlier tests to pass and senior management approval.',
      vi: 'Các kiểu test DR, từ ít đến nhiều gián đoạn nhất: read-through (checklist), structured walk-through (tabletop), simulation, parallel test và full interruption. Qua được mức này mới có cơ sở lên mức sau. Full interruption sát thực tế nhất nhưng có thể gây outage thật, nên chỉ làm khi các test trước đã đạt và có ban lãnh đạo cấp cao duyệt.',
    },
    takeaway: {
      en: 'Read-through → walk-through → simulation → parallel → full interruption. Never start at the top.',
      vi: 'Read-through → walk-through → simulation → parallel → full interruption. Đừng bao giờ nhảy thẳng lên mức cao nhất.',
    },
    concepts: ['DR testing', 'tabletop', 'parallel test', 'full interruption'],
  },

  // ── Domain 8 ──────────────────────────────────────────────────────────────
  {
    id: 'polyinstantiation-inference',
    domainId: 'd8',
    title: { en: 'Two records for one ship', vi: 'Một con tàu, hai bản ghi' },
    situation: {
      en: 'A defence logistics database tracks ship movements. The real destination of the ship "Orion" is Secret. If its row were simply hidden from Unclassified users, they would notice a missing ship and guess that something sensitive is happening. So the database stores a second row with the same key, labelled Unclassified, showing the destination as "Training exercise".',
      vi: 'Một database hậu cần quốc phòng theo dõi hành trình tàu. Điểm đến thật của tàu "Orion" là Secret. Nếu chỉ giấu dòng đó đi với user Unclassified thì họ sẽ thấy thiếu một con tàu và đoán là đang có chuyện nhạy cảm. Nên database lưu thêm một dòng thứ hai cùng key, gắn nhãn Unclassified, ghi điểm đến là "Diễn tập huấn luyện".',
    },
    question: { en: 'What technique is this, and what does it protect against?', vi: 'Đây là kỹ thuật gì, và nó dùng để chống lại cái gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Polyinstantiation, to prevent inference.', vi: 'Polyinstantiation, để chống inference.' },
        why: {
          en: 'Correct. Polyinstantiation keeps several versions of the same record at different classification levels so lower-level users cannot deduce higher-level facts.',
          vi: 'Đúng. Polyinstantiation giữ nhiều phiên bản của cùng một bản ghi ở các mức classification khác nhau, để user mức thấp không suy ra được thông tin ở mức cao.',
        },
      },
      {
        id: 'B',
        text: { en: 'Aggregation control, to prevent aggregation.', vi: 'Aggregation control, để chống aggregation.' },
        why: {
          en: 'Aggregation is combining many low-sensitivity items into something sensitive. The defence here is a duplicate record, not limits on combining data.',
          vi: 'Nhầm khái niệm. Aggregation là gom nhiều dữ liệu ít nhạy cảm lại thành thứ nhạy cảm. Ở đây cách phòng thủ là thêm một bản ghi trùng key, chứ không phải giới hạn việc gom dữ liệu.',
        },
      },
      {
        id: 'C',
        text: { en: 'Encryption at rest, to prevent disclosure.', vi: 'Mã hóa dữ liệu at rest, để chống lộ dữ liệu.' },
        why: {
          en: 'Encryption protects stored data from people without keys. Authorised database users would still see the gap.',
          vi: 'Mã hóa chỉ bảo vệ dữ liệu lưu trữ khỏi người không có khóa. User database hợp lệ vẫn thấy chỗ trống như thường.',
        },
      },
      {
        id: 'D',
        text: { en: 'Normalisation, to prevent redundancy.', vi: 'Normalisation, để tránh dư thừa dữ liệu.' },
        why: {
          en: 'Normalisation removes duplicate data for design quality. This technique deliberately adds a duplicate.',
          vi: 'Ngược hẳn. Normalisation bỏ dữ liệu trùng cho thiết kế gọn hơn, còn kỹ thuật này lại cố tình thêm một bản trùng.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Inference = deducing sensitive information from data you are allowed to see. Aggregation = combining several less sensitive pieces to produce something more sensitive. Defences include polyinstantiation (cover records at lower levels), cell suppression, noise and perturbation, views and context-dependent access control.',
      vi: 'Inference là suy ra thông tin nhạy cảm từ những dữ liệu bạn được phép xem. Aggregation là gom nhiều mảnh ít nhạy cảm lại để ra thứ nhạy cảm hơn. Cách phòng thủ gồm polyinstantiation (tạo bản ghi che mắt ở mức thấp hơn), cell suppression, thêm noise/perturbation, dùng view và access control theo ngữ cảnh.',
    },
    takeaway: {
      en: 'Polyinstantiation = same key, different classification levels, used against inference.',
      vi: 'Polyinstantiation = cùng key, khác mức classification, dùng để chống inference.',
    },
    concepts: ['polyinstantiation', 'inference', 'aggregation', 'database security'],
  },
  {
    id: 'pipeline-separation-of-duties',
    domainId: 'd8',
    title: { en: 'Straight from laptop to production', vi: 'Từ laptop thẳng lên production' },
    situation: {
      en: 'A startup has grown to 60 developers. Any developer can merge to the main branch, and the pipeline deploys straight to production. A developer "temporarily" disabled the payment fraud checks, and nobody noticed for two weeks.',
      vi: 'Một startup giờ đã có 60 dev. Dev nào cũng merge được vào branch main, và pipeline deploy thẳng lên production. Có một dev "tạm thời" tắt phần kiểm tra gian lận thanh toán, và suốt hai tuần không ai hay biết.',
    },
    question: { en: 'Which control BEST addresses this?', vi: 'Control nào xử lý chuyện này TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Run SAST on every build.', vi: 'Chạy SAST cho mọi bản build.' },
        why: {
          en: 'SAST looks for insecure coding patterns. Turning off a business check is a deliberate logic change it will not flag.',
          vi: 'SAST đi tìm các pattern code không an toàn. Tắt một bước kiểm tra nghiệp vụ là thay đổi logic có chủ ý, SAST sẽ không báo gì.',
        },
      },
      {
        id: 'B',
        text: { en: 'Ask developers to sign an acceptable use policy.', vi: 'Bắt dev ký acceptable use policy.' },
        why: {
          en: 'A signed policy sets expectations but does not stop or detect the change.',
          vi: 'Chỉ trên giấy. Policy đã ký thì đặt ra kỳ vọng, nhưng không chặn được, cũng không phát hiện được thay đổi đó.',
        },
      },
      {
        id: 'C',
        text: { en: 'Commission an annual penetration test of the payment flow.', vi: 'Thuê pentest luồng thanh toán mỗi năm một lần.' },
        why: {
          en: 'A yearly test might catch it months later. The gap is in how changes reach production.',
          vi: 'Quá thưa. Pentest hằng năm có bắt được thì cũng là vài tháng sau. Lỗ hổng thật nằm ở cách change đi lên production.',
        },
      },
      {
        id: 'D',
        text: {
          en: 'Require approval from a reviewer other than the author before merge, enforced by branch protection, so every production change is reviewed and traceable.',
          vi: 'Bắt buộc một reviewer khác tác giả duyệt trước khi merge, áp bằng branch protection, để mọi change lên production đều có review và truy vết được.',
        },
        why: {
          en: 'Correct. This builds separation of duties and change control into the pipeline: no single person can both write and release a change.',
          vi: 'Đúng. Cách này cài separation of duties và change control vào ngay pipeline: không ai vừa tự viết vừa tự release một change được.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Separation of duties means no single person controls a sensitive process end to end. In DevSecOps it shows up as mandatory peer review, protected branches, signed commits, pipeline approvals and restricted production access. It works alongside automated testing and change management, not instead of them.',
      vi: 'Separation of duties nghĩa là không ai một mình nắm trọn một quy trình nhạy cảm từ đầu đến cuối. Trong DevSecOps, nó thể hiện qua review bắt buộc, protected branch, signed commit, approval trong pipeline và giới hạn quyền vào production. Nó chạy song song với automated testing và change management, chứ không thay thế hai thứ đó.',
    },
    takeaway: {
      en: 'The person who writes a change should not be the only one who approves it.',
      vi: 'Người viết change không được là người duy nhất duyệt change đó.',
    },
    concepts: ['separation of duties', 'change control', 'DevSecOps', 'code review'],
  },
];
