// Expert-mode scenarios. Rules: longer situations with irrelevant detail, the deciding fact
// buried in the middle, four options from the same concept family (at least two are things you
// would genuinely do), and a mix of BEST / LEAST / EXCEPT / concept questions.

import type { Scenario } from './scenarios.ts';

export const EXPERT_SCENARIOS: Scenario[] = [
  // ── Domain 1 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-ransomware-safeguard-value',
    domainId: 'd1',
    alsoDomains: ['d7'],
    level: 'expert',
    title: { en: 'Three proposals for the warehouse system', vi: 'Ba phương án cho hệ thống kho' },
    situation: {
      en: 'A logistics company runs its warehouse management system on-premises. The risk team estimates a ransomware incident on it would cost $2,000,000 (SLE) and expects one every four years (ARO 0.25). The CFO, who chairs the risk committee, prefers insurance because "it is the simplest". Three proposals are costed. (1) Cyber insurance: $120,000 per year, pays up to $1,500,000 per incident after a $250,000 deductible. (2) Immutable backups plus EDR: $180,000 per year; the team estimates this cuts the ARO to 0.05 and the SLE to $600,000. (3) Moving to a SaaS warehouse platform: $400,000 per year more than today, with the vendor\'s own ransomware exposure not yet assessed.',
      vi: 'Một công ty logistics chạy hệ thống quản lý kho on-premises. Team risk ước tính nếu hệ thống này dính ransomware thì mỗi vụ thiệt hại $2.000.000 (SLE), và cứ bốn năm lại có một vụ (ARO 0,25). CFO, người chủ trì ủy ban risk, thích mua bảo hiểm vì "đơn giản nhất". Có ba phương án đã tính chi phí. (1) Bảo hiểm cyber: $120.000/năm, chi trả tối đa $1.500.000 mỗi vụ sau khi trừ mức khấu trừ $250.000. (2) Immutable backup cộng EDR: $180.000/năm; team ước tính ARO giảm còn 0,05 và SLE còn $600.000. (3) Chuyển sang một nền tảng quản lý kho SaaS: tốn thêm $400.000/năm so với hiện tại, còn rủi ro ransomware phía vendor thì chưa ai đánh giá.',
    },
    question: { en: 'Based on the value of each safeguard, which option should you recommend?', vi: 'Dựa trên giá trị của từng safeguard, bạn nên đề xuất phương án nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Cyber insurance, because it transfers the largest share of the loss.', vi: 'Bảo hiểm cyber, vì nó chuyển giao được phần thiệt hại lớn nhất.' },
        why: {
          en: 'The insurer pays its $1,500,000 cap, so the company keeps $500,000 per incident (the $250,000 deductible plus $250,000 above the cap). Retained ALE = 0.25 × $500,000 = $125,000, a reduction of $375,000. Minus the $120,000 premium, the value is about $255,000: positive, but lower than the backup option. Insurance also does nothing to make an incident less likely.',
          vi: 'Chưa phải. Bên bảo hiểm trả tối đa $1.500.000, nên mỗi vụ công ty vẫn tự gánh $500.000 (khấu trừ $250.000 cộng $250.000 vượt mức trần). ALE còn lại = 0,25 × $500.000 = $125.000, tức giảm được $375.000. Trừ phí $120.000 thì giá trị khoảng $255.000: dương, nhưng thấp hơn phương án backup. Mà bảo hiểm cũng chẳng làm sự cố ít xảy ra hơn.',
        },
      },
      {
        id: 'B',
        text: { en: 'Immutable backups and EDR, because they reduce both likelihood and impact.', vi: 'Immutable backup và EDR, vì giảm được cả khả năng xảy ra lẫn tác động.' },
        why: {
          en: 'Correct. ALE before = $500,000. ALE after = 0.05 × $600,000 = $30,000. Value = ($500,000 − $30,000) − $180,000 = $290,000, the highest of the options.',
          vi: 'Đúng. ALE trước = $500.000. ALE sau = 0,05 × $600.000 = $30.000. Giá trị = ($500.000 − $30.000) − $180.000 = $290.000, cao nhất trong các phương án.',
        },
      },
      {
        id: 'C',
        text: { en: 'The SaaS migration, because it removes the on-premises exposure entirely.', vi: 'Chuyển sang SaaS, vì loại bỏ hoàn toàn rủi ro on-premises.' },
        why: {
          en: 'Even if it removed all $500,000 of ALE, the value would be at most $100,000, and the vendor\'s exposure is unassessed, so the real reduction is unknown.',
          vi: 'Kể cả xóa sạch $500.000 ALE thì giá trị cũng chỉ tối đa $100.000, mà rủi ro phía vendor chưa được đánh giá nên mức giảm thực tế vẫn là ẩn số.',
        },
      },
      {
        id: 'D',
        text: { en: 'Insurance and the SaaS migration together, to cover both likelihood and impact.', vi: 'Kết hợp bảo hiểm và chuyển SaaS, để phủ cả khả năng xảy ra lẫn tác động.' },
        why: {
          en: 'Combining controls can be right, but here the two costs ($520,000) exceed the entire ALE, so the combination has negative value.',
          vi: 'Kết hợp control nhiều khi là đúng, nhưng ở đây riêng chi phí hai thứ ($520.000) đã vượt cả ALE, nên giá trị âm.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Value of a safeguard = (ALE before − ALE after) − annual cost. Before: $2,000,000 × 0.25 = $500,000. Backups/EDR: +$290,000. Insurance: about +$255,000. SaaS: at most +$100,000, unproven. The CFO\'s preference and "simplest" are noise; the question asks for value. In practice you might add insurance later for residual risk, but the best single recommendation is the control that reduces the risk itself.',
      vi: 'Giá trị safeguard = (ALE trước − ALE sau) − chi phí hằng năm. Trước: $2.000.000 × 0,25 = $500.000. Backup/EDR: +$290.000. Bảo hiểm: khoảng +$255.000. SaaS: tối đa +$100.000, mà chưa chứng minh được. Ý thích của CFO và chuyện "đơn giản nhất" chỉ là nhiễu; câu hỏi hỏi về giá trị. Thực tế sau này bạn có thể mua thêm bảo hiểm cho residual risk, nhưng nếu chỉ đề xuất một thứ thì chọn control làm giảm chính risk đó.',
    },
    takeaway: {
      en: 'Compare safeguards by (ALE before − ALE after) − annual cost. Transfer ≠ reduction.',
      vi: 'So safeguard bằng (ALE trước − ALE sau) − chi phí năm. Chuyển giao ≠ giảm thiểu.',
    },
    concepts: ['quantitative risk', 'safeguard value', 'risk transfer'],
  },
  {
    id: 'expert-ciso-least-role',
    domainId: 'd1',
    level: 'expert',
    title: { en: 'Filling in the governance RACI', vi: 'Điền RACI cho governance' },
    situation: {
      en: 'A mid-sized insurer is formalising its information security governance. The CISO reports to the CEO, and the board has a risk committee that meets quarterly. Internal audit has asked for a RACI matrix before the next committee meeting. The first draft, written by a consultant, lists many duties under the CISO, including some the COO thinks belong elsewhere. The CEO asks you to point out the item that least belongs with the CISO.',
      vi: 'Một công ty bảo hiểm cỡ vừa đang chuẩn hóa governance về an toàn thông tin. CISO báo cáo cho CEO, còn board có một ủy ban risk họp mỗi quý. Internal audit yêu cầu có ma trận RACI trước kỳ họp ủy ban tới. Bản nháp đầu do một consultant viết, dồn rất nhiều việc cho CISO, trong đó có vài việc COO cho là phải thuộc về chỗ khác. CEO nhờ bạn chỉ ra mục ít nên nằm ở CISO nhất.',
    },
    question: { en: 'Which responsibility is LEAST appropriate for the CISO to own?', vi: 'Trách nhiệm nào KÉM PHÙ HỢP NHẤT để CISO nắm?' },
    options: [
      {
        id: 'A',
        text: { en: 'Approving technical security standards that implement approved policy.', vi: 'Phê duyệt các technical security standard để triển khai policy đã duyệt.' },
        why: {
          en: 'Appropriate. Standards and baselines that implement board-approved policy are commonly approved by the CISO; it is policy and risk appetite that senior management owns.',
          vi: 'Hợp lý. Standard và baseline để triển khai policy mà board đã duyệt thường do CISO phê duyệt; thứ ban lãnh đạo phải nắm là policy và risk appetite.',
        },
      },
      {
        id: 'B',
        text: { en: 'Reporting security risk metrics to the board risk committee.', vi: 'Báo cáo các metric về security risk cho ủy ban risk của board.' },
        why: {
          en: 'Appropriate. The CISO informs governance bodies so they can make decisions.',
          vi: 'Phù hợp. CISO cung cấp thông tin để các cơ quan governance ra quyết định.',
        },
      },
      {
        id: 'C',
        text: { en: 'Approving the organisation\'s risk appetite for information risk.', vi: 'Phê duyệt risk appetite của tổ chức đối với rủi ro thông tin.' },
        why: {
          en: 'Correct. This is the one that does not belong. Risk appetite is set by the board and senior management, who own the risk. The CISO advises on it but should not approve it, or security would be setting the business\'s tolerance for loss.',
          vi: 'Đúng. Đây là mục lạc chỗ. Risk appetite do board và ban lãnh đạo, những người sở hữu risk, đặt ra. CISO tư vấn chứ không phê duyệt, nếu không thì bên security lại đi quyết định doanh nghiệp chịu mất bao nhiêu.',
        },
      },
      {
        id: 'D',
        text: { en: 'Coordinating the choice of control frameworks with business owners.', vi: 'Điều phối việc chọn control framework cùng các business owner.' },
        why: {
          en: 'Appropriate. Selecting frameworks such as ISO 27001 or NIST CSF with the business is typical CISO work.',
          vi: 'Ổn. Cùng business chọn framework như ISO 27001 hay NIST CSF là việc quen thuộc của CISO.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'For LEAST questions, three options are correct statements and one is out of place. Senior management is accountable for risk: it sets appetite, accepts residual risk and approves policy. The CISO is responsible for advising, recommending, implementing the program and reporting. Anything where security "approves" what the business is willing to lose is the misfit.',
      vi: 'Với câu LEAST, ba đáp án là phát biểu đúng, chỉ một cái lạc chỗ. Ban lãnh đạo chịu accountability về risk: đặt appetite, chấp nhận residual risk và phê duyệt policy. CISO thì chịu trách nhiệm tư vấn, đề xuất, triển khai chương trình và báo cáo. Hễ chỗ nào security "phê duyệt" mức thiệt hại mà business sẵn sàng chịu thì đó là chỗ sai.',
    },
    takeaway: {
      en: 'Board/senior management set risk appetite and accept risk. The CISO advises and reports.',
      vi: 'Board/ban lãnh đạo đặt risk appetite và chấp nhận risk. CISO tư vấn và báo cáo.',
    },
    concepts: ['governance', 'risk appetite', 'roles and responsibilities'],
  },
  {
    id: 'expert-concept-due-care-lawsuit',
    domainId: 'd1',
    alsoDomains: ['d7'],
    level: 'expert',
    title: { en: 'Nine months of scan reports', vi: 'Chín tháng báo cáo scan' },
    situation: {
      en: 'A retailer was breached through a VPN appliance flaw. The breach exposed 80,000 customer records. In the lawsuit, the plaintiffs\' expert notes that the retailer had an approved patch policy (critical fixes within 30 days), ran monthly vulnerability scans, and that every scan for nine months listed the VPN flaw as critical. The tickets were created automatically and closed as "accepted" by an IT team lead with no sign-off from anyone else. The retailer\'s lawyers point out it had a security program, an annual risk assessment and a CISSP-certified CISO.',
      vi: 'Một công ty bán lẻ bị xâm nhập qua lỗ hổng trên thiết bị VPN, làm lộ 80.000 hồ sơ khách hàng. Trong vụ kiện, chuyên gia phía nguyên đơn chỉ ra: công ty có patch policy đã được duyệt (bản vá critical phải xong trong 30 ngày), có scan lỗ hổng hằng tháng, và suốt chín tháng lần scan nào cũng báo lỗ hổng VPN đó ở mức critical. Ticket được tạo tự động rồi bị một team lead IT đóng với trạng thái "accepted", không có ai khác ký duyệt. Luật sư của công ty thì nhấn mạnh công ty có security program, có đánh giá risk hằng năm và CISO có chứng chỉ CISSP.',
    },
    question: { en: 'Which concept will the plaintiffs MOST likely argue the retailer failed to meet?', vi: 'KHẢ NĂNG CAO NHẤT là nguyên đơn sẽ cho rằng công ty đã không đáp ứng khái niệm nào?' },
    options: [
      {
        id: 'A',
        text: { en: 'Due diligence', vi: 'Due diligence' },
        why: {
          en: 'The retailer did the investigation: policy, scans and a risk assessment. That is the part it can show.',
          vi: 'Phần này công ty làm rồi: có policy, có scan, có đánh giá risk. Đó chính là thứ họ chứng minh được.',
        },
      },
      {
        id: 'B',
        text: { en: 'Downstream liability', vi: 'Downstream liability' },
        why: {
          en: 'Usually describes liability to other organisations harmed through your systems, for example your network used to attack a partner. The plaintiffs will frame this as the retailer\'s own negligence toward its customers, which is a due care argument.',
          vi: 'Thường dùng cho trách nhiệm với tổ chức khác bị hại thông qua hệ thống của bạn, ví dụ mạng của bạn bị dùng để tấn công đối tác. Ở đây nguyên đơn sẽ nói đây là sự cẩu thả của chính công ty với khách hàng của mình, tức là lập luận về due care.',
        },
      },
      {
        id: 'C',
        text: { en: 'Separation of duties', vi: 'Separation of duties' },
        why: {
          en: 'Tempting: one team lead closed the tickets alone. But that is how the failure happened, not the legal standard the plaintiffs argue was breached.',
          vi: 'Dễ bị cuốn vào: một team lead tự đóng ticket một mình. Nhưng đó là cách sự cố lọt qua, chứ không phải chuẩn pháp lý mà nguyên đơn cho là bị vi phạm.',
        },
      },
      {
        id: 'D',
        text: { en: 'Due care', vi: 'Due care' },
        why: {
          en: 'Correct. Knowing about a critical flaw for nine months and not acting is failing to do what a prudent organisation would do. Lack of due care is the basis of a negligence claim.',
          vi: 'Đúng. Biết có lỗ hổng critical suốt chín tháng mà không xử lý là không làm điều một tổ chức cẩn trọng sẽ làm. Thiếu due care chính là cơ sở của cáo buộc cẩu thả (negligence).',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Due diligence is knowing (policy, scanning, assessment); due care is acting on what you know. Having a program, a risk assessment and a certified CISO shows diligence, which is why it is mentioned: it is noise for this question. The unremediated, unapproved acceptance of a known critical flaw is the failure of due care. Separation of duties explains how it slipped through.',
      vi: 'Due diligence là biết (policy, scan, đánh giá); due care là hành động dựa trên những gì mình biết. Có program, có đánh giá risk, có CISO chứng chỉ là bằng chứng của diligence, và chúng được nhắc tới chính vì vậy: với câu hỏi này đó là nhiễu. Một lỗ hổng critical đã biết mà không vá, lại bị "accepted" khi chưa ai phê duyệt, mới là thất bại về due care. Separation of duties chỉ giải thích vì sao nó lọt qua.',
    },
    takeaway: {
      en: 'Knew but did not act → due care failure (negligence), even with a good program on paper.',
      vi: 'Biết mà không làm → thất bại due care (cẩu thả), dù program trên giấy có đẹp đến đâu.',
    },
    concepts: ['due care', 'due diligence', 'negligence', 'risk acceptance'],
  },

  // ── Domain 2 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-sanitization-except',
    domainId: 'd2',
    alsoDomains: ['d7'],
    level: 'expert',
    title: { en: 'End-of-year hardware disposal', vi: 'Thanh lý phần cứng cuối năm' },
    situation: {
      en: 'A hospital is clearing out a storage room before an audit. It contains magnetic backup tapes with patient data, HDDs from old servers, self-encrypting SSDs from laptops that will be reissued to other staff, and standard SSDs from desktops that a refurbisher will buy and resell; the desktops never used disk encryption. The facilities manager wants everything gone by Friday. The records officer confirms the data on all of it is still sensitive. The disposal plan lists one method for each media type.',
      vi: 'Một bệnh viện đang dọn kho trước đợt audit. Trong kho có băng backup từ tính chứa dữ liệu bệnh nhân, HDD tháo từ server cũ, SSD tự mã hóa (self-encrypting) tháo từ laptop sẽ cấp lại cho nhân viên khác, và SSD thường tháo từ máy desktop sẽ bán cho một bên tân trang để họ bán lại; mấy máy desktop này chưa bao giờ dùng mã hóa ổ đĩa. Quản lý cơ sở vật chất muốn dọn sạch trước thứ Sáu. Bộ phận quản lý hồ sơ xác nhận dữ liệu trên tất cả vẫn còn nhạy cảm. Kế hoạch thanh lý ghi một phương pháp cho mỗi loại media.',
    },
    question: { en: 'All of the following methods in the plan are acceptable EXCEPT:', vi: 'Tất cả các phương pháp sau trong kế hoạch đều chấp nhận được, NGOẠI TRỪ:' },
    options: [
      {
        id: 'A',
        text: { en: 'Degauss the magnetic tapes, then destroy them.', vi: 'Degauss các băng từ, sau đó tiêu hủy.' },
        why: {
          en: 'Acceptable. Degaussing purges magnetic media, and destruction afterwards is stronger still.',
          vi: 'Chấp nhận được. Degauss là purge cho media từ tính, tiêu hủy sau đó còn chắc hơn nữa.',
        },
      },
      {
        id: 'B',
        text: { en: 'Cryptographically erase the self-encrypting SSDs before reissuing them.', vi: 'Crypto erase các SSD tự mã hóa trước khi cấp lại.' },
        why: {
          en: 'Acceptable. Crypto erase is a NIST SP 800-88 purge method, and the drives stay inside the organisation.',
          vi: 'Ổn. Crypto erase là phương pháp purge theo NIST SP 800-88, và ổ vẫn nằm trong tổ chức.',
        },
      },
      {
        id: 'C',
        text: { en: 'Cryptographically erase the desktop SSDs before selling them to the refurbisher.', vi: 'Crypto erase các SSD desktop trước khi bán cho bên tân trang.' },
        why: {
          en: 'Correct. This is the unacceptable one. Cryptographic erase works only if the data was encrypted with a key you can destroy. These desktop SSDs are not self-encrypting and had no disk encryption, so there is no key to erase and the data stays readable.',
          vi: 'Đúng. Đây là phương án không chấp nhận được. Crypto erase chỉ có tác dụng khi dữ liệu đã được mã hóa bằng một khóa mà bạn hủy được. Các SSD desktop này không tự mã hóa và cũng không có mã hóa ổ đĩa, nên chẳng có khóa nào để hủy, dữ liệu vẫn đọc được bình thường.',
        },
      },
      {
        id: 'D',
        text: { en: 'Run the vendor sanitize (block erase) command on the desktop SSDs, verify, then sell.', vi: 'Chạy lệnh sanitize (block erase) của nhà sản xuất trên SSD desktop, kiểm tra lại rồi bán.' },
        why: {
          en: 'Acceptable. The manufacturer\'s sanitize or block erase command is a NIST SP 800-88 purge method for flash, and verification confirms it worked.',
          vi: 'Chấp nhận được. Lệnh sanitize hay block erase của nhà sản xuất là phương pháp purge cho flash theo NIST SP 800-88, và bước kiểm tra xác nhận lệnh đã chạy đúng.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'EXCEPT questions hide one wrong statement among three right ones; check each against the media type and where the media is going. Magnetic: degauss or destroy. Self-encrypting SSD: crypto erase. SSD without encryption leaving your control: vendor sanitize command with verification, or destroy. Overwriting is at most a Clear, which is not enough for sensitive media leaving your control. The deciding fact is buried: the desktops never used encryption, so "crypto erase" has nothing to erase. The Friday deadline and the audit are noise.',
      vi: 'Câu EXCEPT giấu một phát biểu sai giữa ba cái đúng; soát từng cái theo loại media và nơi media sẽ đi tới. Media từ tính: degauss hoặc tiêu hủy. SSD tự mã hóa: crypto erase. SSD không mã hóa mà sắp ra khỏi tầm kiểm soát của bạn: lệnh sanitize của nhà sản xuất kèm kiểm tra, hoặc tiêu hủy. Ghi đè thì cùng lắm chỉ là Clear, không đủ cho media nhạy cảm rời khỏi tay bạn. Chi tiết quyết định bị giấu kỹ: máy desktop chưa từng dùng mã hóa, nên "crypto erase" chẳng có gì để xóa. Deadline thứ Sáu và đợt audit là nhiễu.',
    },
    takeaway: {
      en: 'Crypto erase needs encryption that was there all along. Match the method to the media, its encryption and its destination.',
      vi: 'Crypto erase chỉ có nghĩa khi dữ liệu đã được mã hóa từ đầu. Chọn phương pháp theo media, theo mã hóa và theo nơi nó sẽ đi.',
    },
    concepts: ['media sanitization', 'NIST SP 800-88', 'data remanence'],
  },
  {
    id: 'expert-aggregation-classification',
    domainId: 'd2',
    level: 'expert',
    title: { en: 'A spreadsheet built from Internal data', vi: 'Một spreadsheet ghép từ dữ liệu Internal' },
    situation: {
      en: 'A defence contractor classifies employee names, office locations, security clearance levels and project codes as Internal; each appears on the intranet. An HR analyst builds a spreadsheet joining every engineer\'s name, office, security clearance level and the project codes they work on, to plan a reorganisation. The spreadsheet is shared on a team drive with 40 people from HR and facilities. The analyst argues that every field is Internal, so the file is Internal. The data owner for HR records asks for your advice.',
      vi: 'Một nhà thầu quốc phòng phân loại tên nhân viên, địa điểm văn phòng, cấp security clearance và mã dự án là Internal; thông tin nào cũng có trên intranet. Một nhân viên phân tích HR làm một spreadsheet ghép tên, văn phòng, cấp security clearance của từng kỹ sư và các mã dự án họ đang làm, để lên kế hoạch tái cơ cấu. File được share trên một team drive cho 40 người bên HR và bộ phận cơ sở vật chất. Người phân tích lập luận: field nào cũng là Internal thì file cũng là Internal. Data owner của hồ sơ HR hỏi ý kiến bạn.',
    },
    question: { en: 'What should the data owner do FIRST?', vi: 'Data owner nên làm gì TRƯỚC TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Restrict the team drive to the few people who need the file.', vi: 'Giới hạn team drive chỉ cho vài người thật sự cần file.' },
        why: {
          en: 'A good step and probably needed, but how tightly to restrict access depends on the classification, which has not been decided.',
          vi: 'Nên làm và có lẽ cũng cần, nhưng siết quyền chặt tới đâu còn tùy classification, mà classification thì chưa quyết.',
        },
      },
      {
        id: 'B',
        text: { en: 'Raise the classification of the combined dataset.', vi: 'Nâng classification của bộ dữ liệu tổng hợp.' },
        why: {
          en: 'Correct. Together, names, clearances and projects reveal who works on what at which level, which is more sensitive than any single field. Classification drives the handling rules that follow.',
          vi: 'Đúng. Gộp tên, clearance và dự án lại thì lộ ra ai làm gì ở cấp nào, nhạy cảm hơn bất kỳ field riêng lẻ nào. Classification quyết định các quy tắc xử lý đi theo sau.',
        },
      },
      {
        id: 'C',
        text: { en: 'Encrypt the spreadsheet and share the key only with HR leadership.', vi: 'Mã hóa spreadsheet và chỉ đưa khóa cho lãnh đạo HR.' },
        why: {
          en: 'A handling control that may be required once the classification is set, but it jumps ahead of deciding how sensitive the data is.',
          vi: 'Là control xử lý có thể sẽ cần khi đã có classification, nhưng nó nhảy cóc qua bước xác định dữ liệu nhạy cảm tới mức nào.',
        },
      },
      {
        id: 'D',
        text: { en: 'Keep it Internal, since every field is already approved at that level.', vi: 'Giữ mức Internal, vì field nào cũng đã được duyệt ở mức đó.' },
        why: {
          en: 'This is the analyst\'s argument, and it ignores aggregation: combined data can be more sensitive than its parts.',
          vi: 'Đây chính là lập luận của người phân tích, và nó bỏ qua aggregation: dữ liệu gộp lại có thể nhạy cảm hơn từng phần.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Aggregation: individually harmless items combine into something sensitive. The owner classifies the new asset first, then access restriction, encryption and labelling follow from that classification. A and C are both sensible; they come after.',
      vi: 'Aggregation: từng mẩu thông tin vô hại nhưng gộp lại thành thứ nhạy cảm. Owner phải phân loại tài sản mới trước, rồi giới hạn quyền, mã hóa và gắn nhãn mới đi theo classification đó. A và C đều hợp lý; chỉ là chúng đến sau.',
    },
    takeaway: {
      en: 'Combined data can outrank its parts. Classify the new dataset, then apply controls.',
      vi: 'Dữ liệu gộp có thể nhạy cảm hơn từng phần. Phân loại bộ dữ liệu mới trước, rồi mới áp control.',
    },
    concepts: ['aggregation', 'classification', 'data owner'],
  },
  {
    id: 'expert-pos-memory-scraping',
    domainId: 'd2',
    alsoDomains: ['d4'],
    level: 'expert',
    title: { en: 'Card data in the till', vi: 'Dữ liệu thẻ trong máy tính tiền' },
    situation: {
      en: 'A restaurant chain with 300 sites already sends card data over TLS 1.2 to its payment gateway, and the gateway returns tokens so no card numbers are stored. A forensic report on a recent breach found RAM-scraping malware on the Windows-based point-of-sale terminals; it read card numbers from memory as the POS application processed them. The terminals are patched monthly, run antivirus, and are on a separate VLAN. The CFO wants the change that removes the most risk for the money.',
      vi: 'Một chuỗi nhà hàng 300 điểm đã gửi dữ liệu thẻ qua TLS 1.2 tới payment gateway, và gateway trả về token nên không lưu số thẻ nào. Báo cáo forensic sau một vụ xâm nhập gần đây tìm thấy malware RAM-scraping trên các máy POS chạy Windows; nó đọc số thẻ từ bộ nhớ lúc ứng dụng POS đang xử lý. Các máy POS được patch hằng tháng, có antivirus và nằm trên VLAN riêng. CFO muốn thay đổi nào gỡ được nhiều risk nhất so với số tiền bỏ ra.',
    },
    question: { en: 'Which control BEST addresses this exposure?', vi: 'Control nào xử lý điểm hở này TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Application allowlisting on every POS terminal so only approved software runs.', vi: 'Application allowlisting trên mọi máy POS để chỉ phần mềm được duyệt mới chạy.' },
        why: {
          en: 'Strong: it would likely have blocked this malware. But card data would still be in clear text in POS memory, so a bypass or a new technique brings the exposure back, and PCI scope is unchanged.',
          vi: 'Mạnh: nhiều khả năng đã chặn được con malware này. Nhưng số thẻ vẫn nằm dạng clear text trong bộ nhớ POS, nên chỉ cần một cách bypass hay kỹ thuật mới là hở lại, và PCI scope vẫn y nguyên.',
        },
      },
      {
        id: 'B',
        text: { en: 'File integrity monitoring on the POS operating system.', vi: 'File integrity monitoring trên hệ điều hành POS.' },
        why: {
          en: 'Detects changes after the fact. Memory scrapers can run without changing monitored files.',
          vi: 'Chỉ phát hiện thay đổi sau khi đã xảy ra. Memory scraper có thể chạy mà không đụng tới file nào đang được giám sát.',
        },
      },
      {
        id: 'C',
        text: { en: 'Upgrade the link to the payment gateway to TLS 1.3.', vi: 'Nâng kết nối tới payment gateway lên TLS 1.3.' },
        why: {
          en: 'Improves protection in transit, which was not where the data was stolen.',
          vi: 'Tăng bảo vệ lúc dữ liệu đang truyền, mà dữ liệu đâu có bị lấy ở đoạn đó.',
        },
      },
      {
        id: 'D',
        text: { en: 'Point-to-point encryption (P2PE) in the card readers.', vi: 'Point-to-point encryption (P2PE) trong đầu đọc thẻ.' },
        why: {
          en: 'Correct. With validated P2PE the card number is encrypted in the reader before the POS sees it, so there is nothing to scrape, and the POS largely drops out of PCI scope.',
          vi: 'Đúng. Với P2PE đã được validate, số thẻ được mã hóa ngay trong đầu đọc trước khi POS nhìn thấy, nên chẳng còn gì để scrape, và POS phần lớn ra khỏi PCI scope.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Map the attack to the data state: TLS covered transit, tokenisation covered rest, the gap was data in use on the POS. The best control removes clear-text data from that system rather than trying to keep malware off it. Allowlisting is a valuable layer, which is why it is the strongest distractor.',
      vi: 'Gắn tấn công với trạng thái dữ liệu: TLS lo phần đang truyền, tokenization lo phần lưu trữ, còn chỗ hở là dữ liệu đang dùng trên POS. Control tốt nhất là đưa clear text ra khỏi hệ thống đó, chứ không phải cố giữ malware tránh xa nó. Allowlisting là một lớp có giá trị, nên nó mới là đáp án gây nhiễu mạnh nhất.',
    },
    takeaway: {
      en: 'Data in use exposed → remove the clear text from that system if you can (P2PE), not just harden it.',
      vi: 'Hở dữ liệu đang dùng → nếu được thì loại clear text khỏi hệ thống đó (P2PE), đừng chỉ hardening.',
    },
    concepts: ['data in use', 'P2PE', 'PCI DSS scope'],
  },

  // ── Domain 3 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-forward-secrecy',
    domainId: 'd3',
    alsoDomains: ['d4'],
    level: 'expert',
    title: { en: 'A stolen server key and recorded traffic', vi: 'Khóa server bị đánh cắp và traffic bị ghi lại' },
    situation: {
      en: 'An internal investigation found that a former contractor copied the private key of the company\'s customer portal TLS certificate six months ago. Network logs suggest that someone with access to an upstream provider has been recording traffic to the portal for at least a year. The certificate is RSA-2048, the server negotiated TLS 1.2 with TLS_RSA_WITH_AES_256_GCM_SHA384, HSTS is enabled and the certificate has been revoked and replaced. Management asks what configuration would have most limited the damage.',
      vi: 'Điều tra nội bộ phát hiện một contractor cũ đã copy private key của certificate TLS trên customer portal từ sáu tháng trước. Log mạng cho thấy có người có quyền truy cập ở một nhà cung cấp upstream đã ghi lại traffic tới portal ít nhất một năm nay. Certificate là RSA-2048, server negotiate TLS 1.2 với TLS_RSA_WITH_AES_256_GCM_SHA384, HSTS đã bật, và certificate đã bị revoke rồi thay mới. Ban lãnh đạo hỏi cấu hình nào lẽ ra đã hạn chế thiệt hại được nhiều nhất.',
    },
    question: { en: 'Which configuration would have MOST limited the impact?', vi: 'Cấu hình nào lẽ ra đã hạn chế tác động HIỆU QUẢ NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'A 4096-bit RSA key instead of 2048-bit.', vi: 'Khóa RSA 4096-bit thay vì 2048-bit.' },
        why: {
          en: 'A longer key resists brute force, but the key was stolen, not cracked. A stolen 4096-bit key decrypts recorded traffic just as well.',
          vi: 'Khóa dài hơn thì chống brute force tốt hơn, nhưng khóa bị đánh cắp chứ đâu bị bẻ. Khóa 4096-bit bị lấy mất thì vẫn giải mã traffic đã ghi lại như thường.',
        },
      },
      {
        id: 'B',
        text: { en: 'Ephemeral (EC)DHE key exchange for every session.', vi: 'Trao đổi khóa ephemeral (EC)DHE cho mọi session.' },
        why: {
          en: 'Correct. With forward secrecy each session key is negotiated with throwaway keys, so the stolen certificate key cannot decrypt past recordings.',
          vi: 'Đúng. Với forward secrecy, mỗi session key được thỏa thuận bằng khóa dùng một lần rồi bỏ, nên khóa certificate bị lấy cũng không giải mã được những gì đã ghi lại.',
        },
      },
      {
        id: 'C',
        text: { en: 'Certificate pinning in the customer mobile app.', vi: 'Certificate pinning trong mobile app của khách hàng.' },
        why: {
          en: 'Helps against fraudulent certificates in active attacks. It does nothing for passively recorded traffic encrypted with the real key.',
          vi: 'Giúp chống certificate giả trong tấn công chủ động. Còn traffic bị ghi lại thụ động, mã hóa bằng chính khóa thật, thì nó không giúp được gì.',
        },
      },
      {
        id: 'D',
        text: { en: 'OCSP stapling so clients learn quickly that the certificate is revoked.', vi: 'OCSP stapling để client sớm biết certificate đã bị revoke.' },
        why: {
          en: 'Speeds up revocation checks for future connections, but revocation cannot protect traffic that was already recorded.',
          vi: 'Giúp kiểm tra revoke nhanh hơn cho các kết nối sau này, nhưng revoke không bảo vệ được traffic đã bị ghi từ trước.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'The deciding facts are buried: the key was copied (not broken) and traffic was recorded (passive). With RSA key exchange, the server key decrypts every recorded session. Forward secrecy breaks that link. TLS 1.3 only allows forward-secret key exchange, which is one reason it is preferred.',
      vi: 'Chi tiết quyết định nằm khuất: khóa bị copy (chứ không bị bẻ) và traffic bị ghi lại (thụ động). Với trao đổi khóa RSA, khóa server giải mã được mọi session đã ghi. Forward secrecy cắt đứt mối liên hệ đó. TLS 1.3 chỉ cho phép trao đổi khóa có forward secrecy, đó là một lý do nó được ưu tiên.',
    },
    takeaway: {
      en: 'Stolen key + recorded traffic → only forward secrecy (ephemeral DH) protects the past.',
      vi: 'Khóa bị đánh cắp + traffic bị ghi lại → chỉ forward secrecy (DH ephemeral) bảo vệ được quá khứ.',
    },
    concepts: ['forward secrecy', 'TLS', 'key exchange'],
  },
  {
    id: 'expert-m-of-n',
    domainId: 'd3',
    alsoDomains: ['d1'],
    level: 'expert',
    title: { en: 'Protecting the root CA key', vi: 'Bảo vệ khóa của root CA' },
    situation: {
      en: 'A bank is building an offline root certificate authority in an HSM. The design review set three requirements. Activation must need several of the five named security officers together, and must still be possible if any two of them are unavailable. No single officer may ever know or hold enough of the secret to activate it alone. The ceremony must be recorded and witnessed by internal audit. The vendor\'s HSM supports smart-card quorum authentication.',
      vi: 'Một ngân hàng đang dựng root CA offline trên HSM. Buổi design review chốt ba yêu cầu. Muốn kích hoạt phải có nhiều người trong số năm security officer được chỉ định cùng tham gia, và vẫn kích hoạt được nếu bất kỳ hai người nào vắng mặt. Không officer nào được biết hoặc giữ đủ phần bí mật để tự mình kích hoạt. Buổi ceremony phải được ghi hình và có internal audit chứng kiến. HSM của vendor hỗ trợ xác thực quorum bằng smart card.',
    },
    question: { en: 'Which control BEST describes what the bank needs?', vi: 'Control nào mô tả TỐT NHẤT thứ ngân hàng cần?' },
    options: [
      {
        id: 'A',
        text: { en: 'Dual control', vi: 'Dual control' },
        why: {
          en: 'Requires two people to act together. Close, but it does not express "any three of five".',
          vi: 'Yêu cầu hai người cùng làm. Gần đúng, nhưng không diễn tả được "ba người bất kỳ trong năm".',
        },
      },
      {
        id: 'B',
        text: { en: 'Split knowledge', vi: 'Split knowledge' },
        why: {
          en: 'Ensures no single person knows the whole secret, which is one of the requirements, but on its own it does not define the quorum.',
          vi: 'Đảm bảo không ai biết trọn bí mật, khớp một yêu cầu, nhưng tự nó không định nghĩa quorum.',
        },
      },
      {
        id: 'C',
        text: { en: 'M of N control', vi: 'M of N control' },
        why: {
          en: 'Correct. A quorum of M (3) out of N (5) custodians, each holding a share, is required. It combines split knowledge with a flexible form of dual control.',
          vi: 'Đúng. Cần quorum M (3) trên N (5) người giữ khóa, mỗi người giữ một phần. Nó kết hợp split knowledge với một dạng dual control linh hoạt.',
        },
      },
      {
        id: 'D',
        text: { en: 'Separation of duties', vi: 'Separation of duties' },
        why: {
          en: 'Divides different tasks between different roles. Here the same task needs several people at once.',
          vi: 'Chia các việc khác nhau cho các vai trò khác nhau. Ở đây là cùng một việc mà cần nhiều người làm cùng lúc.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'All four are related collusion controls; the wording decides. Dual control: two people together. Split knowledge: nobody holds the whole secret. M of N: a quorum of M from N, each with a share. Separation of duties: different people do different parts of a process. "Any three of five" plus "nobody can do it alone" is M of N.',
      vi: 'Cả bốn đều là control chống thông đồng có liên quan nhau; câu chữ mới là thứ quyết định. Dual control: hai người cùng làm. Split knowledge: không ai giữ trọn bí mật. M of N: quorum M người trong N, mỗi người giữ một phần. Separation of duties: mỗi người làm một khâu khác nhau trong quy trình. "Ba người bất kỳ trong năm" cộng "không ai tự làm một mình được" là M of N.',
    },
    takeaway: {
      en: '"Any M of N people" → M of N control. Two at once → dual control. Nobody has it all → split knowledge.',
      vi: '"M người bất kỳ trong N" → M of N. Hai người cùng lúc → dual control. Không ai có trọn → split knowledge.',
    },
    concepts: ['M of N control', 'split knowledge', 'dual control', 'key management'],
  },
  {
    id: 'expert-fire-suppression',
    domainId: 'd3',
    level: 'expert',
    title: { en: 'Choosing sprinklers for the new server room', vi: 'Chọn sprinkler cho phòng server mới' },
    situation: {
      en: 'A university is converting a basement into a server room that will also house two staffed operator desks. The building code requires a water-based sprinkler system; a gas system was rejected on cost. The basement has heating, and pipes do not freeze. The insurer notes two water-damage claims in the building last year, both from sprinkler heads damaged during maintenance. The facilities team wants to avoid water reaching servers unless there is a real fire.',
      vi: 'Một trường đại học đang cải tạo tầng hầm thành phòng server, trong đó còn có hai bàn trực vận hành có người ngồi. Quy chuẩn xây dựng bắt buộc dùng hệ thống sprinkler bằng nước; phương án khí đã bị loại vì chi phí. Tầng hầm có sưởi, đường ống không bị đóng băng. Bên bảo hiểm ghi nhận năm ngoái tòa nhà có hai vụ claim hư hại do nước, cả hai đều do đầu sprinkler bị va hỏng trong lúc bảo trì. Team cơ sở vật chất muốn nước không chạm tới server trừ khi có cháy thật.',
    },
    question: { en: 'Which sprinkler design is MOST appropriate?', vi: 'Thiết kế sprinkler nào PHÙ HỢP NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Wet pipe', vi: 'Wet pipe' },
        why: {
          en: 'Cheapest and fastest, but pipes are always full, so a damaged head (like last year\'s two claims) floods the room immediately.',
          vi: 'Rẻ và nhanh nhất, nhưng ống lúc nào cũng đầy nước, nên một đầu phun bị hỏng (như hai vụ năm ngoái) là phòng ngập ngay.',
        },
      },
      {
        id: 'B',
        text: { en: 'Dry pipe', vi: 'Dry pipe' },
        why: {
          en: 'Pipes hold pressurised air and fill when a head opens. Mainly used where pipes could freeze, which is not the case here, and a damaged head still releases water.',
          vi: 'Ống chứa khí nén, chỉ nạp nước khi có đầu phun mở. Chủ yếu dùng ở nơi ống có thể đóng băng, mà ở đây thì không, và đầu phun bị hỏng vẫn xả nước.',
        },
      },
      {
        id: 'C',
        text: { en: 'Deluge', vi: 'Deluge' },
        why: {
          en: 'Opens all heads at once to dump large volumes of water. Suited to high-hazard areas, not a room full of electronics.',
          vi: 'Mở mọi đầu phun cùng lúc để xả một lượng nước lớn. Hợp với khu vực nguy cơ cao, chứ không phải phòng toàn đồ điện tử.',
        },
      },
      {
        id: 'D',
        text: { en: 'Pre-action', vi: 'Pre-action' },
        why: {
          en: 'Correct. Pipes stay dry until a detector confirms fire; only then do they fill, and a head must still melt to release water. A knocked head alone releases nothing.',
          vi: 'Đúng. Ống để khô cho tới khi đầu báo xác nhận có cháy; lúc đó ống mới nạp nước, và vẫn phải có đầu phun bung ra vì nhiệt thì nước mới xả. Chỉ va hỏng một đầu phun thì không có giọt nước nào.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Facts that matter: water-based is required, freezing is not an issue (removes the main reason for dry pipe), and accidental discharge is the concern. Pre-action needs two events (detection, then a head opening), which is why it is the usual recommendation for data processing areas with people present.',
      vi: 'Những chi tiết đáng kể: bắt buộc dùng nước, không lo đóng băng (mất luôn lý do chính để chọn dry pipe), và nỗi lo là xả nhầm. Pre-action cần hai sự kiện (phát hiện cháy, rồi một đầu phun mở), nên nó là lựa chọn thường được khuyến nghị cho khu xử lý dữ liệu có người làm việc.',
    },
    takeaway: {
      en: 'Water-based + protect equipment from accidental discharge → pre-action.',
      vi: 'Bắt buộc dùng nước + phải tránh xả nhầm vào thiết bị → pre-action.',
    },
    concepts: ['fire suppression', 'pre-action', 'physical security'],
  },

  // ── Domain 4 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-dmarc-spoofing',
    domainId: 'd4',
    level: 'expert',
    title: { en: 'Invoices that look like ours', vi: 'Hóa đơn trông như của mình' },
    situation: {
      en: 'Customers of a manufacturing company are receiving fake invoices that appear to come from billing@ at the company\'s own domain. The company\'s SPF record ends with ~all, its own mail server signs outgoing mail with DKIM, and employees use S/MIME for some sensitive internal email. The marketing team uses two SaaS mailing services that send on the company\'s behalf. The fraud has already cost one customer $80,000.',
      vi: 'Khách hàng của một công ty sản xuất đang nhận hóa đơn giả trông như gửi từ billing@ trên chính domain của công ty. SPF record của công ty kết thúc bằng ~all, mail server của công ty có ký DKIM cho mail gửi ra, và nhân viên dùng S/MIME cho một số email nội bộ nhạy cảm. Team marketing dùng hai dịch vụ gửi mail SaaS gửi thay mặt công ty. Vụ lừa đảo đã làm một khách hàng mất $80.000.',
    },
    question: { en: 'Which control would MOST effectively stop these spoofed emails reaching customers?', vi: 'Control nào chặn những email giả mạo này tới tay khách hàng HIỆU QUẢ NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Change the SPF record from ~all to -all so failures are hard fails.', vi: 'Đổi SPF record từ ~all sang -all để fail thành hard fail.' },
        why: {
          en: 'Tighter, but SPF checks the envelope sender, not the visible From header, and receivers decide on their own what to do with a failure.',
          vi: 'Chặt hơn, nhưng SPF kiểm tra envelope sender chứ không phải header From mà người nhận nhìn thấy, và bên nhận tự quyết xử lý thế nào khi fail.',
        },
      },
      {
        id: 'B',
        text: { en: 'Publish a DMARC policy and move it to p=reject.', vi: 'Publish DMARC policy rồi nâng dần lên p=reject.' },
        why: {
          en: 'Correct. DMARC ties SPF or DKIM results to the visible From domain and tells receiving servers to reject mail that fails. Starting in monitor mode lets you add the SaaS senders first.',
          vi: 'Đúng. DMARC gắn kết quả SPF hoặc DKIM với domain trong From mà người dùng thấy, và bảo server nhận reject mail bị fail. Bắt đầu ở chế độ monitor để thêm các SaaS sender vào trước.',
        },
      },
      {
        id: 'C',
        text: { en: 'Require DKIM signing on every SaaS sender as well.', vi: 'Bắt buộc mọi SaaS sender cũng phải ký DKIM.' },
        why: {
          en: 'Necessary groundwork, but signatures alone do not tell receivers to reject unsigned mail claiming to be you.',
          vi: 'Là nền móng cần có, nhưng chữ ký thôi thì không bảo bên nhận phải reject mail không ký mà mạo danh bạn.',
        },
      },
      {
        id: 'D',
        text: { en: 'Extend S/MIME signing to all external invoices.', vi: 'Mở rộng ký S/MIME cho mọi hóa đơn gửi ra ngoài.' },
        why: {
          en: 'Lets careful recipients verify real invoices, but fake ones still arrive, and most customers never check signatures.',
          vi: 'Người nhận cẩn thận thì kiểm tra được hóa đơn thật, nhưng hóa đơn giả vẫn tới, và đa số khách hàng chẳng bao giờ kiểm tra chữ ký.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'SPF and DKIM are building blocks; DMARC is the policy layer that protects the From domain users actually see and gives receivers an instruction. A safe rollout is p=none with reports, fix legitimate senders, then quarantine, then reject.',
      vi: 'SPF và DKIM là viên gạch; DMARC là lớp policy bảo vệ domain trong From mà người dùng thật sự nhìn thấy, đồng thời ra chỉ thị cho bên nhận. Triển khai an toàn: p=none kèm report, sửa các sender hợp lệ, rồi quarantine, rồi reject.',
    },
    takeaway: {
      en: 'Exact-domain spoofing → DMARC enforcement (built on SPF/DKIM alignment).',
      vi: 'Giả mạo đúng domain → enforce DMARC (dựa trên alignment của SPF/DKIM).',
    },
    concepts: ['DMARC', 'SPF', 'DKIM', 'email security'],
  },
  {
    id: 'expert-eap-evil-twin',
    domainId: 'd4',
    alsoDomains: ['d5'],
    level: 'expert',
    title: { en: 'An access point in the car park', vi: 'Một access point ngoài bãi xe' },
    situation: {
      en: 'A law firm uses WPA2-Enterprise with PEAP-MSCHAPv2, so staff log in to Wi-Fi with their domain username and password. A penetration test set up an access point in the car park with the same SSID; 14 laptops connected to it and handed over MSCHAPv2 challenge-responses that were cracked within a day. The test report notes the laptops were not configured to validate the RADIUS server certificate. The firm has an internal PKI and manages all laptops with MDM. The partners want the most robust long-term fix.',
      vi: 'Một công ty luật dùng WPA2-Enterprise với PEAP-MSCHAPv2, nên nhân viên đăng nhập Wi-Fi bằng username và password domain. Đợt pentest dựng một access point ngoài bãi xe với cùng SSID; 14 laptop đã kết nối vào và nộp luôn challenge-response MSCHAPv2, bị crack trong vòng một ngày. Báo cáo pentest ghi chú các laptop không được cấu hình để validate certificate của RADIUS server. Công ty có PKI nội bộ và quản lý toàn bộ laptop bằng MDM. Các partner muốn cách sửa bền vững nhất về lâu dài.',
    },
    question: { en: 'Which change BEST addresses the problem for the long term?', vi: 'Thay đổi nào xử lý vấn đề TỐT NHẤT về lâu dài?' },
    options: [
      {
        id: 'A',
        text: { en: 'Push a profile that forces laptops to validate the RADIUS server certificate.', vi: 'Đẩy profile buộc laptop phải validate certificate của RADIUS server.' },
        why: {
          en: 'Fixes the immediate misconfiguration and should be done now. But staff still type domain passwords into Wi-Fi, so any future validation slip, or a user clicking through a prompt, exposes credentials again.',
          vi: 'Sửa được lỗi cấu hình trước mắt và nên làm ngay. Nhưng nhân viên vẫn gõ password domain vào Wi-Fi, nên sau này chỉ cần sót validate, hay user bấm bỏ qua cảnh báo, là credential lại lộ.',
        },
      },
      {
        id: 'B',
        text: { en: 'Deploy a wireless IPS to detect and contain rogue access points.', vi: 'Triển khai wireless IPS để phát hiện và khống chế rogue access point.' },
        why: {
          en: 'Useful detection, but the evil twin was in the car park, beyond reliable containment, and detection does not stop credential capture.',
          vi: 'Phát hiện thì có ích, nhưng evil twin nằm ngoài bãi xe, ngoài tầm khống chế đáng tin cậy, mà phát hiện cũng không chặn được chuyện bị lấy credential.',
        },
      },
      {
        id: 'C',
        text: { en: 'Move to EAP-TLS with device certificates issued through MDM.', vi: 'Chuyển sang EAP-TLS với device certificate cấp qua MDM.' },
        why: {
          en: 'Correct. Mutual certificate authentication removes passwords from Wi-Fi entirely, and the client validates the server as part of the protocol. The existing PKI and MDM make it practical.',
          vi: 'Đúng. Xác thực certificate hai chiều loại hẳn password khỏi Wi-Fi, và client validate server ngay trong giao thức. PKI và MDM sẵn có khiến việc này làm được.',
        },
      },
      {
        id: 'D',
        text: { en: 'Move from PEAP-MSCHAPv2 to EAP-TTLS with inner PAP.', vi: 'Chuyển từ PEAP-MSCHAPv2 sang EAP-TTLS với inner PAP.' },
        why: {
          en: 'Still a password-based method inside a tunnel. If clients do not validate the server, the evil twin receives the password itself, which is worse than a crackable challenge-response.',
          vi: 'Vẫn là phương thức dùng password bên trong tunnel. Nếu client không validate server thì evil twin nhận thẳng password, còn tệ hơn một challenge-response phải crack mới ra.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Two options fix the root cause: enforcing server validation (A) and removing passwords with EAP-TLS (C). "Most robust long-term" favours C, which eliminates the credential being stolen; A is the right immediate step. The PKI and MDM details are there to show C is feasible.',
      vi: 'Có hai đáp án xử lý gốc rễ: bắt buộc validate server (A) và bỏ password bằng EAP-TLS (C). "Bền vững nhất về lâu dài" nghiêng về C, vì nó loại bỏ chính credential đang bị đánh cắp; A là bước đúng để làm ngay. Chi tiết PKI và MDM có mặt để cho thấy C làm được.',
    },
    takeaway: {
      en: 'Evil twin + PEAP passwords → validate the server now; EAP-TLS for the long term.',
      vi: 'Evil twin + password PEAP → validate server ngay; về lâu dài thì EAP-TLS.',
    },
    concepts: ['802.1X', 'EAP-TLS', 'PEAP', 'evil twin'],
  },
  {
    id: 'expert-dns-least-effective',
    domainId: 'd4',
    level: 'expert',
    title: { en: 'Hardening the recursive resolvers', vi: 'Hardening các recursive resolver' },
    situation: {
      en: 'After a regional ISP suffered a cache-poisoning attack, a company\'s network team reviews its two internal recursive DNS resolvers. These resolvers answer queries for 5,000 employees and look up external names on the internet. The team drafts four changes and must cut one for budget reasons. The CIO asks which change contributes least to protecting the resolvers\' caches from poisoning.',
      vi: 'Sau khi một ISP trong khu vực bị tấn công cache poisoning, team network của một công ty rà lại hai recursive DNS resolver nội bộ. Hai resolver này trả lời truy vấn cho 5.000 nhân viên và tra các tên miền bên ngoài trên internet. Team soạn ra bốn thay đổi và phải cắt một cái vì ngân sách. CIO hỏi thay đổi nào góp ít nhất vào việc bảo vệ cache của resolver khỏi bị poisoning.',
    },
    question: { en: 'Which change is LEAST effective against cache poisoning of these resolvers?', vi: 'Thay đổi nào ÍT HIỆU QUẢ NHẤT trong việc chống cache poisoning cho các resolver này?' },
    options: [
      {
        id: 'A',
        text: { en: 'Enable DNSSEC validation on the resolvers.', vi: 'Bật DNSSEC validation trên các resolver.' },
        why: {
          en: 'Highly effective: forged answers for signed zones fail validation and are not cached.',
          vi: 'Rất hiệu quả: câu trả lời giả cho các zone có ký sẽ fail validation và không vào được cache.',
        },
      },
      {
        id: 'B',
        text: { en: 'Randomise source ports and query IDs for upstream queries.', vi: 'Random hóa source port và query ID cho truy vấn upstream.' },
        why: {
          en: 'Effective: attackers must guess both values to forge a matching answer, which makes Kaminsky-style attacks impractical.',
          vi: 'Hiệu quả: kẻ tấn công phải đoán trúng cả hai giá trị mới giả được câu trả lời khớp, nên tấn công kiểu Kaminsky gần như không khả thi.',
        },
      },
      {
        id: 'C',
        text: { en: 'Allow recursion only for internal client addresses.', vi: 'Chỉ cho phép recursion với địa chỉ client nội bộ.' },
        why: {
          en: 'Effective: outsiders cannot make the resolvers send queries on demand, which most poisoning attacks need.',
          vi: 'Có tác dụng: người ngoài không thể bắt resolver gửi truy vấn theo ý mình, mà đa số kiểu poisoning cần điều đó.',
        },
      },
      {
        id: 'D',
        text: { en: 'Use DNS over HTTPS from employee devices.', vi: 'Dùng DNS over HTTPS trên thiết bị của nhân viên.' },
        why: {
          en: 'Correct. This is the least effective. DoH protects the client-to-resolver hop from eavesdropping and tampering, but poisoning happens on the resolver-to-internet side, which DoH does not touch.',
          vi: 'Đúng. Đây là cái kém hiệu quả nhất. DoH bảo vệ chặng từ client tới resolver khỏi bị nghe lén và sửa đổi, còn poisoning xảy ra ở chặng resolver ra internet, chỗ DoH không đụng tới.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Locate the attack: cache poisoning means forged answers from upstream reaching the resolver. DNSSEC validation, port/ID randomisation and restricting who can trigger recursion all act there. DoH is valuable for privacy and for the client hop, but it is aimed at a different link.',
      vi: 'Xác định chỗ bị tấn công: cache poisoning là câu trả lời giả từ upstream lọt vào resolver. DNSSEC validation, random port/ID và giới hạn ai được kích hoạt recursion đều tác động ở đó. DoH có giá trị cho privacy và cho chặng client, nhưng nó nhắm vào một đường khác.',
    },
    takeaway: {
      en: 'Match the control to the link attacked. DoH protects client↔resolver, not resolver↔internet.',
      vi: 'Chọn control theo đúng chặng bị tấn công. DoH bảo vệ client↔resolver, không phải resolver↔internet.',
    },
    concepts: ['DNS cache poisoning', 'DNSSEC', 'DNS over HTTPS'],
  },

  // ── Domain 5 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-golden-ticket',
    domainId: 'd5',
    alsoDomains: ['d7'],
    level: 'expert',
    title: { en: 'Domain admin keeps coming back', vi: 'Domain admin cứ quay lại' },
    situation: {
      en: 'During incident response, the team removed the attacker\'s malware, reset every administrator password and rebuilt two domain controllers from clean media. Two days later, logs show the attacker again accessing file servers as a domain admin, using Kerberos tickets whose issuance appears in no domain controller\'s security log. The forensic timeline shows the attacker had full control of a domain controller for three weeks before detection. The CIO wants to know why the resets did not work.',
      vi: 'Trong lúc xử lý incident, team đã gỡ malware của attacker, reset mật khẩu mọi tài khoản admin và dựng lại hai domain controller từ media sạch. Hai ngày sau, log cho thấy attacker lại vào file server dưới quyền domain admin, dùng các Kerberos ticket mà security log của không domain controller nào ghi nhận lần cấp. Timeline forensic cho thấy attacker đã nắm toàn quyền một domain controller suốt ba tuần trước khi bị phát hiện. CIO muốn biết vì sao reset rồi mà không ăn thua.',
    },
    question: { en: 'What must be done to invalidate the attacker\'s access?', vi: 'Phải làm gì để vô hiệu hóa quyền truy cập của attacker?' },
    options: [
      {
        id: 'A',
        text: { en: 'Force a password reset for every user and administrator account.', vi: 'Bắt reset mật khẩu cho mọi tài khoản user và admin.' },
        why: {
          en: 'Reasonable hygiene after a domain compromise, but forged tickets do not depend on any user\'s password.',
          vi: 'Là vệ sinh hợp lý sau khi domain bị chiếm, nhưng ticket giả mạo không phụ thuộc vào mật khẩu của user nào cả.',
        },
      },
      {
        id: 'B',
        text: { en: 'Reduce the maximum Kerberos ticket lifetime in domain policy.', vi: 'Giảm thời hạn tối đa của Kerberos ticket trong domain policy.' },
        why: {
          en: 'Forged tickets carry whatever lifetime the attacker writes into them; the policy is enforced only when a DC issues tickets.',
          vi: 'Ticket giả mạo có thời hạn bao lâu là do attacker tự ghi vào; DC chỉ áp policy khi chính nó cấp ticket.',
        },
      },
      {
        id: 'C',
        text: { en: 'Rebuild the remaining domain controllers from clean media.', vi: 'Dựng lại các domain controller còn lại từ media sạch.' },
        why: {
          en: 'Rebuilding hosts does not change the account secret replicated across the domain, so tickets signed with it stay valid.',
          vi: 'Dựng lại máy không làm thay đổi secret của tài khoản đang replicate khắp domain, nên ticket ký bằng secret đó vẫn còn hiệu lực.',
        },
      },
      {
        id: 'D',
        text: { en: 'Reset the KRBTGT account password twice.', vi: 'Reset mật khẩu tài khoản KRBTGT hai lần.' },
        why: {
          en: 'Correct. These are golden tickets, signed with the KRBTGT secret stolen from the DC. Changing it twice (the account keeps the previous key) invalidates every forged ticket.',
          vi: 'Đúng. Đây là golden ticket, ký bằng secret của KRBTGT bị lấy từ DC. Phải đổi hai lần (vì tài khoản này vẫn giữ key trước đó) thì mọi ticket giả mạo mới mất hiệu lực.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Clues: valid tickets with no issuance in any DC log, after a long DC compromise. That is a golden ticket. The KDC signs TGTs with the KRBTGT key; whoever has it can mint tickets for anyone. Resetting it twice (waiting at least the maximum ticket lifetime, 10 hours by default, and letting replication finish in between) is the standard recovery step, alongside the broader hygiene in A and C.',
      vi: 'Manh mối: ticket hợp lệ nhưng không DC nào có log cấp, sau một thời gian dài DC bị chiếm. Đó là golden ticket. KDC ký TGT bằng key của KRBTGT; ai có key này thì tự tạo ticket cho bất kỳ ai cũng được. Reset hai lần (ở giữa chờ ít nhất bằng thời hạn ticket tối đa, mặc định 10 giờ, và để replication chạy xong) là bước phục hồi chuẩn, đi cùng các bước vệ sinh rộng hơn như A và C.',
    },
    takeaway: {
      en: 'Forged TGTs after a DC compromise → reset KRBTGT twice.',
      vi: 'TGT giả mạo sau khi DC bị chiếm → reset KRBTGT hai lần.',
    },
    concepts: ['Kerberos', 'golden ticket', 'KRBTGT', 'incident recovery'],
  },
  {
    id: 'expert-recertification-least',
    domainId: 'd5',
    alsoDomains: ['d6'],
    level: 'expert',
    title: { en: 'Who signs off on finance access?', vi: 'Ai ký duyệt quyền vào module finance?' },
    situation: {
      en: 'A listed company must recertify access to its ERP finance module every quarter for SOX. The module has 220 users across accounting, treasury and procurement. The IT access team provisions accounts from approved tickets and knows the entitlements best. Line managers know what their staff do day to day. The finance controller is the data owner, and internal audit samples the results each year. The project manager proposes a list of reviewers and asks which one should not be used.',
      vi: 'Một công ty niêm yết phải recertify quyền truy cập module tài chính của ERP mỗi quý theo SOX. Module có 220 user thuộc kế toán, ngân quỹ và mua hàng. Team IT access tạo tài khoản theo ticket đã duyệt và là bên nắm entitlement rõ nhất. Quản lý trực tiếp thì biết nhân viên mình làm gì hằng ngày. Finance controller là data owner, còn internal audit lấy mẫu kết quả mỗi năm. Project manager đưa ra danh sách người review và hỏi nên bỏ vai trò nào.',
    },
    question: { en: 'Which proposed role in the recertification is LEAST appropriate?', vi: 'Vai trò nào trong đề xuất recertification là KÉM PHÙ HỢP NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'The IT access team attests that each user\'s access is appropriate.', vi: 'Team IT access xác nhận quyền của từng user là phù hợp.' },
        why: {
          en: 'Correct. This is the one that does not belong. They granted the access, so reviewing it is reviewing their own work. They can supply the data, but should not attest that access is right.',
          vi: 'Đúng. Đây là vai trò không nên có. Chính họ cấp quyền, nên review quyền đó là tự review việc mình làm. Họ có thể cung cấp dữ liệu, nhưng không nên đứng ra xác nhận quyền là đúng.',
        },
      },
      {
        id: 'B',
        text: { en: 'Each line manager attests that their staff still need the access.', vi: 'Từng quản lý trực tiếp xác nhận nhân viên mình vẫn cần quyền đó.' },
        why: {
          en: 'Appropriate: managers confirm whether each person still needs the access for their current job.',
          vi: 'Phù hợp: quản lý xác nhận từng người còn cần quyền đó cho công việc hiện tại hay không.',
        },
      },
      {
        id: 'C',
        text: { en: 'The finance controller, as data owner, approves sensitive entitlements.', vi: 'Finance controller, là data owner, duyệt các entitlement nhạy cảm.' },
        why: {
          en: 'Appropriate: the owner is accountable for who may access the data and approves sensitive entitlements.',
          vi: 'Phù hợp: owner chịu trách nhiệm ai được truy cập dữ liệu và duyệt các entitlement nhạy cảm.',
        },
      },
      {
        id: 'D',
        text: { en: 'Internal audit tests a sample of the completed reviews each year.', vi: 'Internal audit kiểm tra mẫu các đợt review đã xong mỗi năm.' },
        why: {
          en: 'Appropriate as independent assurance that the review was performed properly, even though it is not the primary reviewer.',
          vi: 'Phù hợp, vì đây là lớp assurance độc lập xác nhận review đã làm đúng, dù audit không phải người review chính.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Recertification is attested by people who understand the business need (managers, data owners), with independent assurance (audit). Those who administer access support the review with reports but should not certify their own changes. "Knows the entitlements best" is the bait.',
      vi: 'Recertification phải do người hiểu nhu cầu nghiệp vụ xác nhận (quản lý, data owner), cộng thêm assurance độc lập (audit). Người quản trị quyền thì hỗ trợ bằng report chứ không tự chứng nhận thay đổi của chính mình. Câu "nắm entitlement rõ nhất" là mồi nhử.',
    },
    takeaway: {
      en: 'Access reviews: owners and managers attest, audit checks, administrators do not certify their own work.',
      vi: 'Access review: owner và quản lý xác nhận, audit kiểm tra, admin không tự chứng nhận việc mình làm.',
    },
    concepts: ['access recertification', 'separation of duties', 'data owner'],
  },
  {
    id: 'expert-token-revocation',
    domainId: 'd5',
    alsoDomains: ['d8'],
    level: 'expert',
    title: { en: 'Fired at 9, still working at 3', vi: 'Nghỉ việc lúc 9 giờ, 3 giờ chiều vẫn làm việc' },
    situation: {
      en: 'A sales rep was dismissed at 09:00 and their account was disabled in the identity provider at 09:05. At 15:00 the rep was still downloading customer lists from the company\'s single-page CRM app. The app uses OIDC; after login it receives a signed JWT access token valid for 24 hours and checks only the signature and expiry on each API call. MFA is enforced at login. The development team proposes four changes.',
      vi: 'Một nhân viên sales bị cho nghỉ lúc 09:00, tài khoản bị disable trên identity provider lúc 09:05. Đến 15:00 người này vẫn đang tải danh sách khách hàng từ app CRM dạng single-page của công ty. App dùng OIDC; sau khi login nó nhận một JWT access token có chữ ký, hiệu lực 24 giờ, và mỗi lần gọi API chỉ kiểm tra chữ ký và thời hạn. MFA bắt buộc khi login. Team dev đề xuất bốn thay đổi.',
    },
    question: { en: 'Which change BEST prevents this from happening again?', vi: 'Thay đổi nào ngăn chuyện này lặp lại TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Short-lived access tokens with refresh checked by the IdP.', vi: 'Access token sống ngắn, refresh phải qua IdP kiểm tra.' },
        why: {
          en: 'Correct. With access tokens of a few minutes, the app must regularly return to the IdP, which refuses to refresh for a disabled account, so access ends within minutes.',
          vi: 'Đúng. Access token chỉ sống vài phút thì app phải thường xuyên quay về IdP, mà IdP sẽ từ chối refresh cho tài khoản đã disable, nên quyền truy cập chấm dứt trong vài phút.',
        },
      },
      {
        id: 'B',
        text: { en: 'Rotate the JWT signing key whenever someone is terminated.', vi: 'Xoay vòng signing key của JWT mỗi khi có người nghỉ việc.' },
        why: {
          en: 'It works, but it logs out every user each time someone leaves; a blunt emergency measure, not a design.',
          vi: 'Có tác dụng, nhưng mỗi lần có người nghỉ là toàn bộ user bị logout; đây là biện pháp khẩn cấp thô bạo chứ không phải thiết kế.',
        },
      },
      {
        id: 'C',
        text: { en: 'Require MFA again before any bulk export of customer data.', vi: 'Bắt MFA lại trước mọi lần export hàng loạt dữ liệu khách hàng.' },
        why: {
          en: 'Step-up would have blocked the bulk export, because the IdP refuses a disabled account. But the rep could still read, edit and copy everything else until the 24-hour token expired. It protects one action, not the session.',
          vi: 'Step-up sẽ chặn được lần export hàng loạt, vì IdP từ chối tài khoản đã disable. Nhưng người này vẫn đọc, sửa và copy mọi thứ khác cho đến khi token 24 giờ hết hạn. Nó bảo vệ một thao tác chứ không bảo vệ cả session.',
        },
      },
      {
        id: 'D',
        text: { en: 'Allow the CRM only from the office network and VPN.', vi: 'Chỉ cho vào CRM từ mạng văn phòng và VPN.' },
        why: {
          en: 'Network location is not identity: the token stays valid from any allowed network, and the rep may still be on site or in a VPN session nobody ended.',
          vi: 'Vị trí mạng không phải danh tính: token vẫn hợp lệ từ bất kỳ mạng nào được phép, và người này có thể vẫn đang ở văn phòng hoặc trong một VPN session chưa ai ngắt.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Disabling an account does not revoke tokens already issued. Self-contained tokens stay valid until expiry unless the app checks back. The fix is to keep access tokens short-lived and put the account check in the refresh step (or use token introspection/revocation). Deprovisioning must include active sessions and tokens.',
      vi: 'Disable tài khoản không thu hồi các token đã cấp. Token tự chứa (self-contained) vẫn hợp lệ đến khi hết hạn nếu app không hỏi lại. Cách sửa là để access token sống ngắn và đặt bước kiểm tra tài khoản ở khâu refresh (hoặc dùng token introspection/revocation). Deprovisioning phải tính cả session và token đang hoạt động.',
    },
    takeaway: {
      en: 'Disabling the account ≠ revoking tokens. Short access tokens + refresh checks.',
      vi: 'Disable tài khoản ≠ thu hồi token. Access token ngắn + kiểm tra khi refresh.',
    },
    concepts: ['session management', 'JWT', 'deprovisioning', 'OIDC'],
  },

  // ── Domain 6 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-soc-gap',
    domainId: 'd6',
    alsoDomains: ['d1'],
    level: 'expert',
    title: { en: 'A SOC 2 report that ends in September', vi: 'Báo cáo SOC 2 dừng ở tháng 9' },
    situation: {
      en: 'Your company is renewing a contract with a payroll SaaS vendor in March. The vendor provided a clean SOC 2 Type II report covering the twelve months to 30 September last year. Its next report, covering the twelve months to 30 September this year, will not be ready until November. The vendor says nothing material has changed. The procurement team needs assurance for the period since September before signing.',
      vi: 'Tháng 3 này công ty bạn gia hạn hợp đồng với một vendor SaaS tính lương. Vendor đưa ra báo cáo SOC 2 Type II sạch, bao phủ mười hai tháng tính đến 30/9 năm ngoái. Báo cáo kế tiếp, cho mười hai tháng tính đến 30/9 năm nay, phải tới tháng 11 mới có. Vendor nói không có thay đổi gì đáng kể. Team procurement cần assurance cho giai đoạn từ tháng 9 tới giờ rồi mới ký.',
    },
    question: { en: 'What is the BEST way to address the gap?', vi: 'Cách xử lý khoảng trống này TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Request a bridge letter from the vendor\'s management.', vi: 'Yêu cầu ban lãnh đạo vendor cung cấp bridge letter.' },
        why: {
          en: 'Correct. A bridge (gap) letter is management\'s written assertion that controls have not materially changed since the report period. It is the standard way to cover the gap, alongside your own monitoring.',
          vi: 'Đúng. Bridge letter (gap letter) là văn bản ban lãnh đạo vendor khẳng định control không thay đổi đáng kể kể từ sau kỳ báo cáo. Đây là cách chuẩn để lấp khoảng trống, đi cùng monitoring của chính bạn.',
        },
      },
      {
        id: 'B',
        text: { en: 'Rely on the vendor\'s ISO 27001 certificate and its latest surveillance audit.', vi: 'Dựa vào chứng chỉ ISO 27001 và đợt surveillance audit gần nhất của vendor.' },
        why: {
          en: 'Useful and possibly more recent, but a certification audit samples the management system against the standard; it does not test the operating effectiveness of the specific controls your SOC 2 reliance is built on.',
          vi: 'Có ích và có thể mới hơn, nhưng audit chứng nhận chỉ lấy mẫu hệ thống quản lý so với tiêu chuẩn; nó không kiểm tra hiệu quả vận hành của đúng những control mà bạn đang dựa vào qua SOC 2.',
        },
      },
      {
        id: 'C',
        text: { en: 'Commission your own penetration test of the vendor\'s platform.', vi: 'Tự thuê pentest nền tảng của vendor.' },
        why: {
          en: 'SaaS contracts rarely allow it, it tests a point in time, and it covers technical weaknesses rather than whether controls kept operating.',
          vi: 'Hợp đồng SaaS hiếm khi cho phép, pentest chỉ kiểm tra tại một thời điểm, và nó nhắm vào điểm yếu kỹ thuật chứ không xem control có tiếp tục vận hành hay không.',
        },
      },
      {
        id: 'D',
        text: { en: 'Delay the renewal until the next SOC 2 Type II is issued.', vi: 'Hoãn gia hạn đến khi có bản SOC 2 Type II tiếp theo.' },
        why: {
          en: 'Payroll cannot stop for eight months, and there will always be a gap between a report and today.',
          vi: 'Không thể ngừng trả lương tám tháng, và lúc nào cũng sẽ có khoảng cách giữa báo cáo và hôm nay.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Assurance reports always end before the day you rely on them. The usual practice is a bridge letter for the gap plus your own vendor monitoring (questionnaires, incident notices, security ratings). It is weaker than an audit because it is the vendor\'s own assertion, which is why the next Type II still matters.',
      vi: 'Báo cáo assurance lúc nào cũng kết thúc trước ngày bạn dùng nó. Thông lệ là bridge letter cho khoảng trống, cộng với vendor monitoring của chính bạn (questionnaire, thông báo sự cố, security rating). Nó yếu hơn audit vì chỉ là lời khẳng định của chính vendor, nên bản Type II kế tiếp vẫn quan trọng.',
    },
    takeaway: {
      en: 'Gap between report period and today → bridge letter plus your own monitoring.',
      vi: 'Khoảng trống giữa kỳ báo cáo và hôm nay → bridge letter cộng monitoring của chính bạn.',
    },
    concepts: ['SOC 2', 'bridge letter', 'third-party assurance'],
  },
  {
    id: 'expert-kri-vs-kpi',
    domainId: 'd6',
    alsoDomains: ['d1'],
    level: 'expert',
    title: { en: 'One number for the board', vi: 'Một con số cho board' },
    situation: {
      en: 'The board risk committee wants one metric on the quarterly dashboard that warns them when the chance of a serious breach is rising, before anything happens. The security team currently reports patches deployed per month, phishing emails blocked, mean time to detect incidents, and SLA compliance of the managed SOC.',
      vi: 'Ủy ban rủi ro của board muốn có một chỉ số trên dashboard hằng quý để cảnh báo khi khả năng xảy ra một vụ lộ dữ liệu nghiêm trọng đang tăng lên, trước khi có chuyện gì xảy ra. Hiện team security đang báo cáo số patch triển khai mỗi tháng, số email phishing bị chặn, thời gian trung bình để phát hiện incident, và mức tuân thủ SLA của SOC thuê ngoài.',
    },
    question: { en: 'Which metric BEST serves as a key risk indicator for the committee?', vi: 'Chỉ số nào là key risk indicator TỐT NHẤT cho ủy ban?' },
    options: [
      {
        id: 'A',
        text: { en: '% of servers patched within the 30-day SLA.', vi: '% server được patch trong SLA 30 ngày.' },
        why: {
          en: 'A process KPI. It averages across all servers, so 95% compliance can hide the few unpatched internet-facing systems that drive breach risk.',
          vi: 'KPI về quy trình. Nó lấy trung bình trên mọi server, nên tuân thủ 95% vẫn có thể che mất vài hệ thống public ra internet chưa patch, mà chính chúng mới đẩy risk lộ dữ liệu lên.',
        },
      },
      {
        id: 'B',
        text: { en: 'Mean time to detect incidents, against a 24-hour target.', vi: 'Thời gian trung bình phát hiện incident, so với mục tiêu 24 giờ.' },
        why: {
          en: 'A useful KPI for the detection capability, but it is measured after incidents occur and is a lagging view.',
          vi: 'KPI hữu ích cho năng lực phát hiện, nhưng chỉ đo được sau khi incident đã xảy ra, tức là góc nhìn trễ (lagging).',
        },
      },
      {
        id: 'C',
        text: { en: '% of critical internet-facing flaws past the patch SLA.', vi: '% lỗ hổng critical public ra internet đã quá SLA patch.' },
        why: {
          en: 'Correct. It measures exposure that directly drives breach likelihood, before an incident, against a defined threshold the board can watch.',
          vi: 'Đúng. Nó đo mức phơi nhiễm trực tiếp đẩy khả năng lộ dữ liệu lên, trước khi có incident, so với một ngưỡng rõ ràng mà board theo dõi được.',
        },
      },
      {
        id: 'D',
        text: { en: '% of staff who completed security awareness training.', vi: '% nhân viên đã hoàn thành đào tạo security awareness.' },
        why: {
          en: 'A program KPI. Completion shows people attended, not whether the chance of a breach is rising.',
          vi: 'KPI của chương trình. Tỷ lệ hoàn thành cho thấy mọi người đã tham gia, chứ không cho biết khả năng lộ dữ liệu có đang tăng hay không.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'KPIs show how well a process performs; KRIs are forward-looking signals that risk is moving toward or beyond appetite. A good KRI is tied to a specific risk, has a threshold, and changes before the loss event. Exposure measures (unremediated critical flaws on exposed systems) fit; activity counts do not.',
      vi: 'KPI cho biết một quy trình chạy tốt đến đâu; KRI là tín hiệu nhìn về phía trước, báo risk đang tiến gần hoặc vượt risk appetite. KRI tốt gắn với một risk cụ thể, có ngưỡng, và thay đổi trước khi tổn thất xảy ra. Các chỉ số phơi nhiễm (lỗ hổng critical chưa xử lý trên hệ thống lộ ra ngoài) thì hợp; đếm hoạt động thì không.',
    },
    takeaway: {
      en: 'KRI = leading indicator of exposure with a threshold. Activity counts are KPIs.',
      vi: 'KRI = chỉ báo sớm về mức phơi nhiễm, có ngưỡng. Đếm hoạt động là KPI.',
    },
    concepts: ['KRI', 'KPI', 'security metrics'],
  },
  {
    id: 'expert-hardcoded-key-least',
    domainId: 'd6',
    alsoDomains: ['d8'],
    level: 'expert',
    title: { en: 'A key inside the mobile app', vi: 'Một key nằm trong app mobile' },
    situation: {
      en: 'A bank suspects that a third-party SDK in its Android app contains a hard-coded API key for a payment partner. The bank has the app\'s source code but not the SDK\'s; the SDK is shipped as a compiled library inside the APK. The release is in two weeks. The test manager lists four test activities that could be scheduled.',
      vi: 'Một ngân hàng nghi một SDK bên thứ ba trong app Android của mình chứa API key hard-code của một đối tác thanh toán. Ngân hàng có source code của app nhưng không có source của SDK; SDK nằm trong APK dưới dạng thư viện đã biên dịch. Hai tuần nữa là release. Test manager liệt kê bốn hoạt động test có thể xếp lịch.',
    },
    question: { en: 'Which activity is LEAST likely to find the hard-coded key?', vi: 'Hoạt động nào ÍT KHẢ NĂNG NHẤT tìm ra key hard-code?' },
    options: [
      {
        id: 'A',
        text: { en: 'Decompiling the APK and searching the binaries for secrets.', vi: 'Decompile APK rồi tìm secret trong các file binary.' },
        why: {
          en: 'Likely to find it: reverse engineering looks inside the compiled SDK, where the key would be.',
          vi: 'Nhiều khả năng tìm ra: reverse engineering soi vào bên trong SDK đã biên dịch, đúng chỗ key nằm.',
        },
      },
      {
        id: 'B',
        text: { en: 'Dynamic scanning (DAST) of the bank\'s backend APIs.', vi: 'Scan động (DAST) các API backend của ngân hàng.' },
        why: {
          en: 'Correct. This is the least likely. DAST probes the server from outside; a key embedded in the client app never appears in what it tests.',
          vi: 'Đúng. Đây là cái ít khả năng nhất. DAST thăm dò server từ bên ngoài; key nhúng trong app phía client không bao giờ xuất hiện trong thứ nó test.',
        },
      },
      {
        id: 'C',
        text: { en: 'Intercepting the app\'s traffic in a test device with a proxy.', vi: 'Chặn bắt traffic của app trên thiết bị test bằng proxy.' },
        why: {
          en: 'Likely to reveal it if the SDK sends the key in requests to the partner.',
          vi: 'Nhiều khả năng lộ ra nếu SDK gửi key trong request tới đối tác.',
        },
      },
      {
        id: 'D',
        text: { en: 'Running a secrets scanner over the full build output in the pipeline.', vi: 'Chạy secrets scanner trên toàn bộ build output trong pipeline.' },
        why: {
          en: 'Can find it: scanning the built artefacts, not just source, covers the bundled SDK.',
          vi: 'Có thể tìm ra: scan các artefact đã build, chứ không chỉ source, là bao luôn cả SDK đi kèm.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Ask where the evidence lives. The key is inside the client binary and possibly in its traffic. Anything that inspects the binary or the traffic can find it; testing a different component (the backend) cannot. "We have the source" is noise, because the key is in code you do not have.',
      vi: 'Hãy hỏi bằng chứng nằm ở đâu. Key nằm trong binary phía client và có thể cả trong traffic của nó. Cái gì soi binary hoặc traffic thì tìm được; test một thành phần khác (backend) thì không. Câu "có source code" là nhiễu, vì key nằm trong phần code bạn không có.',
    },
    takeaway: {
      en: 'Pick tests that look where the flaw lives. Client-side secrets: binary analysis or traffic, not server DAST.',
      vi: 'Chọn test nhìn đúng chỗ lỗ hổng nằm. Secret phía client: phân tích binary hoặc traffic, không phải DAST server.',
    },
    concepts: ['DAST', 'reverse engineering', 'secrets', 'mobile security'],
  },

  // ── Domain 7 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-bec-next-step',
    domainId: 'd7',
    alsoDomains: ['d5'],
    level: 'expert',
    title: { en: 'An inbox rule nobody created', vi: 'Inbox rule không ai tạo' },
    situation: {
      en: 'At 07:40 the SIEM flags an "impossible travel" sign-in to the CFO\'s Microsoft 365 account from another continent, 20 minutes after a sign-in from the CFO\'s home. The analyst confirms a new inbox rule that forwards every email containing "invoice" to an external address, created three hours ago. The CFO boarded a flight at 08:00 and lands at noon. Legal and the communications team have asked to be kept informed. The incident has been declared.',
      vi: '07:40, SIEM cảnh báo một lần sign-in "impossible travel" vào tài khoản Microsoft 365 của CFO từ một châu lục khác, 20 phút sau một lần sign-in từ nhà CFO. Analyst xác nhận có một inbox rule mới, tạo ba giờ trước, forward mọi email chứa chữ "invoice" ra một địa chỉ bên ngoài. CFO lên máy bay lúc 08:00 và 12 giờ trưa mới hạ cánh. Legal và team truyền thông đã yêu cầu được cập nhật tình hình. Incident đã chính thức được công bố.',
    },
    question: { en: 'What should the team do NEXT?', vi: 'Team nên làm gì TIẾP THEO?' },
    options: [
      {
        id: 'A',
        text: { en: 'Revoke the account\'s sessions, reset credentials, remove the rule.', vi: 'Thu hồi session của tài khoản, reset credential, xóa rule.' },
        why: {
          en: 'Correct. Detection and analysis are done; containment comes next, after recording the rule\'s details as evidence. Revoking sessions matters because a password reset alone does not end existing tokens.',
          vi: 'Đúng. Phát hiện và phân tích đã xong; tiếp theo là containment, sau khi ghi lại chi tiết rule làm evidence. Phải thu hồi session vì chỉ reset mật khẩu thì các token đang có vẫn còn dùng được.',
        },
      },
      {
        id: 'B',
        text: { en: 'Brief legal on possible notification duties for the forwarded emails.', vi: 'Brief legal về nghĩa vụ thông báo liên quan email đã bị forward.' },
        why: {
          en: 'Needed soon, and legal is waiting, but every minute the rule stays active more invoices leave the company.',
          vi: 'Sớm muộn cũng phải làm, và legal đang chờ, nhưng rule còn chạy phút nào là invoice còn bị chuyển ra ngoài phút đó.',
        },
      },
      {
        id: 'C',
        text: { en: 'Image the CFO\'s laptop when the CFO lands to look for malware.', vi: 'Image laptop của CFO khi CFO hạ cánh để tìm malware.' },
        why: {
          en: 'Possibly useful later, but the compromise is in the cloud account, and waiting until noon leaves the attacker active.',
          vi: 'Có thể hữu ích sau này, nhưng thứ bị chiếm là tài khoản cloud, và chờ tới trưa là để attacker tiếp tục hoạt động.',
        },
      },
      {
        id: 'D',
        text: { en: 'Pull the mailbox audit logs to find every email forwarded so far.', vi: 'Kéo mailbox audit log để tìm mọi email đã bị forward.' },
        why: {
          en: 'Essential for scoping, and audit logs are retained, so it can follow containment without losing evidence.',
          vi: 'Rất cần để xác định phạm vi, mà audit log vẫn được lưu giữ nên làm sau containment cũng không mất evidence.',
        },
      },
    ],
    answer: 'A',
    explanation: {
      en: 'Every option is part of a good response; the question is order. Once an incident is confirmed and declared, contain first, especially when data is still leaving. Scoping, legal analysis and endpoint forensics follow. The flight and the waiting stakeholders are pressure, not priorities.',
      vi: 'Option nào cũng là một phần của phản ứng tốt; câu hỏi là thứ tự. Khi incident đã xác nhận và công bố thì containment trước, nhất là khi dữ liệu vẫn đang chảy ra ngoài. Xác định phạm vi, phân tích pháp lý và forensic endpoint làm sau. Chuyến bay và mấy bên đang chờ là áp lực, không phải ưu tiên.',
    },
    takeaway: {
      en: 'Confirmed and still leaking → contain first (revoke sessions, not just reset).',
      vi: 'Đã xác nhận mà vẫn đang rò → containment trước (thu hồi session, không chỉ reset).',
    },
    concepts: ['business email compromise', 'containment', 'incident response order'],
  },
  {
    id: 'expert-differential-restore',
    domainId: 'd7',
    level: 'expert',
    title: { en: 'Which tapes to restore', vi: 'Restore từ những tape nào' },
    situation: {
      en: 'A file server is backed up with a full backup every Sunday at 22:00 and a differential backup at 22:00 on each of the other six nights. The weekly full was verified on Sunday. On Thursday at 22:20, while that night\'s differential job is still running, the server\'s RAID controller fails and corrupts the volume. A new server is ready. The backup operator notes that last month a Tuesday differential failed and was rerun the next morning, but this week every job completed on schedule.',
      vi: 'Một file server chạy backup full lúc 22:00 mỗi Chủ nhật, sáu đêm còn lại chạy backup differential lúc 22:00. Bản full tuần này đã verify hôm Chủ nhật. Thứ Năm lúc 22:20, khi job differential đêm đó vẫn đang chạy, RAID controller của server hỏng và làm hỏng dữ liệu trên volume. Server mới đã sẵn sàng. Người vận hành backup lưu ý tháng trước có một bản differential thứ Ba bị lỗi và phải chạy lại sáng hôm sau, nhưng tuần này mọi job đều chạy xong đúng lịch.',
    },
    question: { en: 'Which backups are needed to restore the most recent data?', vi: 'Cần những bản backup nào để restore được dữ liệu mới nhất?' },
    options: [
      {
        id: 'A',
        text: { en: 'Sunday\'s full plus Monday\'s, Tuesday\'s and Wednesday\'s differentials.', vi: 'Full Chủ nhật cộng differential thứ Hai, thứ Ba và thứ Tư.' },
        why: {
          en: 'That is the incremental pattern. Each differential already contains everything since the full, so the earlier ones are redundant.',
          vi: 'Đó là cách restore của incremental. Mỗi bản differential đã chứa mọi thay đổi kể từ bản full, nên các bản cũ hơn là thừa.',
        },
      },
      {
        id: 'B',
        text: { en: 'Sunday\'s full plus Thursday\'s differential.', vi: 'Full Chủ nhật cộng differential thứ Năm.' },
        why: {
          en: 'Thursday\'s differential started at 22:00 but was still running when the volume failed at 22:20, so it is incomplete and cannot be trusted.',
          vi: 'Differential thứ Năm bắt đầu lúc 22:00 nhưng vẫn đang chạy khi volume hỏng lúc 22:20, nên nó chưa hoàn chỉnh và không tin được.',
        },
      },
      {
        id: 'C',
        text: { en: 'Sunday\'s full plus Wednesday\'s differential.', vi: 'Full Chủ nhật cộng differential thứ Tư.' },
        why: {
          en: 'Correct. A differential holds all changes since the last full, so the full plus the latest differential (Wednesday 22:00) restores everything up to that point.',
          vi: 'Đúng. Differential chứa toàn bộ thay đổi kể từ bản full gần nhất, nên full cộng bản differential mới nhất (22:00 thứ Tư) restore được mọi thứ tới thời điểm đó.',
        },
      },
      {
        id: 'D',
        text: { en: 'Wednesday\'s differential only.', vi: 'Chỉ differential thứ Tư.' },
        why: {
          en: 'A differential contains only changes since the full, so without the full most files are missing.',
          vi: 'Differential chỉ chứa thay đổi kể từ bản full, nên thiếu bản full thì mất phần lớn file.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Full: everything, resets the archive bit. Incremental: changes since the last backup of any kind, resets the bit; restore needs the full plus every incremental in order. Differential: changes since the last full, does not reset the bit; restore needs the full plus the latest differential. Changes made on Thursday are lost either way. Last month\'s failed job is noise.',
      vi: 'Full: lấy hết, reset archive bit. Incremental: thay đổi kể từ lần backup gần nhất bất kể loại nào, reset bit; restore cần full cộng mọi bản incremental theo đúng thứ tự. Differential: thay đổi kể từ bản full gần nhất, không reset bit; restore cần full cộng bản differential mới nhất. Thay đổi trong ngày thứ Năm thì kiểu gì cũng mất. Job lỗi tháng trước là nhiễu.',
    },
    takeaway: {
      en: 'Differential restore = last full + latest differential. Check whether that differential actually ran.',
      vi: 'Restore differential = full gần nhất + differential mới nhất. Kiểm tra xem bản differential đó đã thực sự chạy xong chưa.',
    },
    concepts: ['backup types', 'differential', 'restore'],
  },
  {
    id: 'expert-dr-test-least-disruptive',
    domainId: 'd7',
    level: 'expert',
    title: { en: 'Proving the DR site can take orders', vi: 'Chứng minh DR site nhận được đơn hàng' },
    situation: {
      en: 'An online retailer has walked through its DR plan twice on paper and ran a simulation last quarter. The regulator now wants evidence that the DR site can actually process real orders. The retailer cannot accept any interruption to production during the holiday season, which starts in three weeks. The DR team has four test options.',
      vi: 'Một nhà bán lẻ online đã walk-through kế hoạch DR trên giấy hai lần và chạy một bài simulation hồi quý trước. Giờ cơ quan quản lý muốn có bằng chứng DR site thực sự xử lý được đơn hàng thật. Nhà bán lẻ không chấp nhận bất kỳ gián đoạn nào với production trong mùa lễ, mà ba tuần nữa là vào mùa lễ. Team DR có bốn phương án test.',
    },
    question: { en: 'Which test is the LEAST disruptive option that still proves the DR site can process real transactions?', vi: 'Bài test nào ÍT GÂY GIÁN ĐOẠN NHẤT mà vẫn chứng minh được DR site xử lý được giao dịch thật?' },
    options: [
      {
        id: 'A',
        text: { en: 'A structured walk-through with the recovery teams.', vi: 'Structured walk-through cùng các team phục hồi.' },
        why: {
          en: 'No disruption at all, but no systems process anything, so it cannot prove the site works.',
          vi: 'Hoàn toàn không gián đoạn, nhưng không hệ thống nào xử lý gì cả nên không chứng minh được site hoạt động.',
        },
      },
      {
        id: 'B',
        text: { en: 'A parallel test at the DR site.', vi: 'Parallel test tại DR site.' },
        why: {
          en: 'Correct. The DR site processes real (often replayed) transactions while production keeps running, so it proves capability without interrupting the business.',
          vi: 'Đúng. DR site xử lý giao dịch thật (thường là phát lại) trong khi production vẫn chạy, nên chứng minh được năng lực mà không làm gián đoạn kinh doanh.',
        },
      },
      {
        id: 'C',
        text: { en: 'A full interruption test in the quietest hour, 03:00 to 04:00.', vi: 'Full interruption test vào giờ vắng nhất, 03:00 đến 04:00.' },
        why: {
          en: 'The most convincing proof, and the quiet hour limits the impact, but it is still a planned interruption of production, which the retailer cannot accept now, and a failed cutover would extend it.',
          vi: 'Bằng chứng thuyết phục nhất, và giờ vắng giúp giảm tác động, nhưng đây vẫn là một lần gián đoạn production có kế hoạch, thứ nhà bán lẻ không chấp nhận lúc này, và nếu chuyển đổi thất bại thì gián đoạn còn kéo dài hơn.',
        },
      },
      {
        id: 'D',
        text: { en: 'A simulation exercise with injected failure scenarios.', vi: 'Bài simulation có cài sẵn các kịch bản sự cố.' },
        why: {
          en: 'Exercises people and decisions, and they already did one. It does not run real transactions on DR systems.',
          vi: 'Tập dượt con người và quyết định, mà họ đã làm một lần rồi. Nó không chạy giao dịch thật trên hệ thống DR.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'The question has two constraints: prove real processing, and minimise disruption. Walk-throughs and simulations fail the first; full interruption fails the second. Parallel is the only option meeting both. Reading both halves of a compound qualifier is the skill being tested.',
      vi: 'Câu hỏi có hai ràng buộc: chứng minh xử lý thật, và gây gián đoạn ít nhất. Walk-through và simulation trượt điều kiện đầu; full interruption trượt điều kiện sau. Chỉ parallel đáp ứng cả hai. Kỹ năng đang được kiểm tra là đọc đủ cả hai vế của một qualifier ghép.',
    },
    takeaway: {
      en: 'Real processing without touching production → parallel test.',
      vi: 'Xử lý thật mà không đụng production → parallel test.',
    },
    concepts: ['DR testing', 'parallel test', 'full interruption'],
  },

  // ── Domain 8 ──────────────────────────────────────────────────────────────
  {
    id: 'expert-maturity-level',
    domainId: 'd8',
    alsoDomains: ['d1'],
    level: 'expert',
    title: { en: 'How mature is the secure SDLC?', vi: 'Secure SDLC đang trưởng thành tới đâu?' },
    situation: {
      en: 'A software company has 12 development teams. Two years ago each team followed its own habits. Today there is a documented secure coding standard, a threat-modelling template and a release checklist, all owned by an AppSec team, and every team follows them on every project. Results vary: nobody tracks defect density, fix times or how many issues each control catches. Leadership wants to describe the current maturity in the annual report using the Capability Maturity Model.',
      vi: 'Một công ty phần mềm có 12 team dev. Hai năm trước mỗi team làm theo thói quen riêng. Giờ đã có secure coding standard bằng văn bản, template threat modelling và checklist release, tất cả do team AppSec sở hữu, và team nào cũng áp dụng cho mọi dự án. Kết quả thì không đồng đều: không ai theo dõi defect density, thời gian sửa hay mỗi control bắt được bao nhiêu lỗi. Ban lãnh đạo muốn mô tả mức trưởng thành hiện tại trong báo cáo thường niên theo Capability Maturity Model.',
    },
    question: { en: 'Which maturity level BEST describes the company today?', vi: 'Maturity level nào mô tả công ty hiện tại TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Level 2: Repeatable', vi: 'Level 2: Repeatable' },
        why: {
          en: 'Repeatable means basic practices exist and can be repeated, often team by team. The company is past this: practices are standard across all teams.',
          vi: 'Repeatable nghĩa là đã có các practice cơ bản và lặp lại được, thường theo từng team. Công ty đã vượt mức này: practice đã chuẩn hóa trên mọi team.',
        },
      },
      {
        id: 'B',
        text: { en: 'Level 3: Defined', vi: 'Level 3: Defined' },
        why: {
          en: 'Correct. Processes are documented, standardised and used organisation-wide, but not yet measured.',
          vi: 'Đúng. Quy trình đã có tài liệu, chuẩn hóa và dùng trên toàn tổ chức, nhưng chưa ai đo lường.',
        },
      },
      {
        id: 'C',
        text: { en: 'Level 4: Managed', vi: 'Level 4: Managed' },
        why: {
          en: 'Managed requires quantitative measurement and control of the process. Nothing is being measured yet.',
          vi: 'Managed đòi hỏi đo lường và kiểm soát quy trình bằng số liệu. Hiện chưa có gì được đo cả.',
        },
      },
      {
        id: 'D',
        text: { en: 'Level 5: Optimizing', vi: 'Level 5: Optimizing' },
        why: {
          en: 'Optimising means continuous improvement driven by those measurements, which do not exist.',
          vi: 'Optimizing là cải tiến liên tục dựa trên chính các số đo đó, mà số đo thì chưa có.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'CMM: 1 Initial (ad hoc), 2 Repeatable (basic, project-level discipline), 3 Defined (standard, documented, organisation-wide), 4 Managed (measured and controlled quantitatively), 5 Optimizing (continuous improvement). The deciding sentence is "nobody tracks" anything, which caps the company at Defined.',
      vi: 'CMM: 1 Initial (ad hoc), 2 Repeatable (kỷ luật cơ bản ở mức dự án), 3 Defined (chuẩn, có tài liệu, toàn tổ chức), 4 Managed (đo lường và kiểm soát định lượng), 5 Optimizing (cải tiến liên tục). Câu quyết định là "không ai theo dõi" gì cả, và chính nó giữ công ty ở mức Defined.',
    },
    takeaway: {
      en: 'Standardised everywhere but unmeasured = Defined (3). Measured = Managed (4).',
      vi: 'Chuẩn hóa khắp nơi nhưng chưa đo = Defined (3). Có đo = Managed (4).',
    },
    concepts: ['CMM', 'maturity models', 'secure SDLC'],
  },
  {
    id: 'expert-build-compromise',
    domainId: 'd8',
    alsoDomains: ['d3'],
    level: 'expert',
    title: { en: 'A signed release with a backdoor', vi: 'Bản release có chữ ký mà vẫn chứa backdoor' },
    situation: {
      en: 'A software vendor discovers that its last two releases contained a backdoor. The source code in the repository is clean, every commit was peer reviewed, SAST and SCA passed, and the releases were properly code-signed with the vendor\'s key, which sits in an HSM. Investigators find that attackers had access to the build server and that the tampering happened after checkout and before packaging. Customers ask what control will catch this next time.',
      vi: 'Một vendor phần mềm phát hiện hai bản release gần nhất của mình chứa backdoor. Source code trong repository sạch, commit nào cũng được peer review, SAST và SCA đều pass, và các bản release đều code-sign đúng chuẩn bằng key của vendor nằm trong HSM. Điều tra cho thấy attacker có quyền vào build server, và mã bị sửa sau bước checkout, trước bước đóng gói. Khách hàng hỏi lần sau control nào sẽ bắt được chuyện này.',
    },
    question: { en: 'Which control would MOST directly detect this type of attack?', vi: 'Control nào phát hiện kiểu tấn công này TRỰC TIẾP NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Moving the code-signing key to a separate, more tightly controlled HSM.', vi: 'Chuyển code-signing key sang một HSM riêng, kiểm soát chặt hơn.' },
        why: {
          en: 'The key was not stolen; the build system asked the HSM to sign a tampered artefact. Signing proves who released it, not that it matches the source.',
          vi: 'Key không hề bị đánh cắp; chính build system nhờ HSM ký một artefact đã bị sửa. Chữ ký chứng minh ai phát hành, chứ không chứng minh nó khớp với source.',
        },
      },
      {
        id: 'B',
        text: { en: 'Reproducible builds checked by a second, independent builder.', vi: 'Reproducible build, đối chiếu bằng một builder thứ hai độc lập.' },
        why: {
          en: 'Correct. If the same source must produce bit-for-bit identical output on independent builders, a build tampered on one server produces a different hash and is caught before release.',
          vi: 'Đúng. Nếu cùng một source phải cho ra output giống hệt từng bit trên các builder độc lập, thì bản build bị sửa trên một server sẽ có hash khác và bị bắt trước khi release.',
        },
      },
      {
        id: 'C',
        text: { en: 'Signed commits and branch protection on the main repository.', vi: 'Ký commit và bật branch protection trên repository chính.' },
        why: {
          en: 'Protects the source history, which was already clean. The change was made after the code left the repository.',
          vi: 'Bảo vệ lịch sử source, mà source vốn đã sạch. Thay đổi xảy ra sau khi code rời khỏi repository.',
        },
      },
      {
        id: 'D',
        text: { en: 'Adding dynamic testing (DAST) of every release candidate.', vi: 'Thêm dynamic testing (DAST) cho mọi release candidate.' },
        why: {
          en: 'A well-hidden backdoor rarely shows up in generic dynamic scans, and DAST does not compare the build to the source.',
          vi: 'Backdoor giấu kỹ hiếm khi lộ ra trong các lượt scan động chung chung, và DAST cũng không so bản build với source.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Map the controls to the supply-chain stage. Review and SAST protect the source; signing protects distribution; the gap was the build. Reproducible builds (and build provenance attestations, as in SLSA) verify that the artefact is exactly what the source produces.',
      vi: 'Gắn từng control với đúng công đoạn của supply chain. Review và SAST bảo vệ source; ký số bảo vệ khâu phân phối; lỗ hổng nằm ở khâu build. Reproducible build (và build provenance attestation như trong SLSA) xác minh artefact đúng là thứ mà source tạo ra.',
    },
    takeaway: {
      en: 'Clean source, signed but tampered release → verify the build itself (reproducible builds, provenance).',
      vi: 'Source sạch, release có chữ ký nhưng bị sửa → kiểm chứng chính khâu build (reproducible build, provenance).',
    },
    concepts: ['supply chain', 'reproducible builds', 'code signing'],
  },
  {
    id: 'expert-acid-isolation',
    domainId: 'd8',
    level: 'expert',
    title: { en: 'Two withdrawals in the same millisecond', vi: 'Hai lệnh rút tiền trong cùng một mili giây' },
    situation: {
      en: 'A fintech app lets users withdraw from a wallet. A tester sent two withdrawal requests of $900 at the same moment from an account holding $1,000. Both succeeded: $1,800 was paid out, yet the balance shows $100. Each request reads the balance, checks it is enough, then writes the new balance. The database logs show both transactions committed and survived a restart, and each transaction on its own is correct.',
      vi: 'Một app fintech cho user rút tiền từ ví. Tester gửi cùng lúc hai request rút $900 từ một tài khoản có $1.000. Cả hai đều thành công: $1.800 đã chi ra, vậy mà số dư vẫn hiện $100. Mỗi request đọc số dư, kiểm tra đủ tiền, rồi ghi số dư mới. Log database cho thấy cả hai transaction đều đã commit và vẫn còn sau khi restart, và xét riêng thì transaction nào cũng đúng.',
    },
    question: { en: 'Which ACID property, if properly enforced, would have prevented the two transactions from interfering?', vi: 'Thuộc tính ACID nào, nếu enforce đúng, đã ngăn được hai transaction ảnh hưởng lẫn nhau?' },
    options: [
      {
        id: 'A',
        text: { en: 'Atomicity', vi: 'Atomicity' },
        why: {
          en: 'Each withdrawal completed fully; nothing was left half-done. Atomicity was not the problem.',
          vi: 'Mỗi lệnh rút đều hoàn tất trọn vẹn, không có gì dở dang. Atomicity không phải vấn đề.',
        },
      },
      {
        id: 'B',
        text: { en: 'Consistency', vi: 'Consistency' },
        why: {
          en: 'The stored balance ($100) satisfies every constraint, so no consistency rule would have fired. The money was lost because each transaction overwrote the other\'s update.',
          vi: 'Số dư đang lưu ($100) thỏa mọi constraint, nên chẳng rule consistency nào bị kích hoạt. Tiền mất là vì transaction này ghi đè lên cập nhật của transaction kia.',
        },
      },
      {
        id: 'C',
        text: { en: 'Isolation', vi: 'Isolation' },
        why: {
          en: 'Correct. With proper isolation (for example serializable transactions or a row lock on read), the second withdrawal would see the first one\'s result or wait, and fail the balance check.',
          vi: 'Đúng. Có isolation đúng mức (ví dụ transaction serializable hoặc lock dòng khi đọc) thì lệnh rút thứ hai sẽ thấy kết quả của lệnh thứ nhất hoặc phải chờ, rồi trượt bước kiểm tra số dư.',
        },
      },
      {
        id: 'D',
        text: { en: 'Durability', vi: 'Durability' },
        why: {
          en: 'Committed data survived a restart, so durability worked, unfortunately.',
          vi: 'Dữ liệu đã commit vẫn còn sau restart, nên durability vẫn chạy tốt, tiếc là vậy.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'This is a lost update, a race condition (time of check to time of use) between two transactions. No database rule caught it; isolation is the mechanism that keeps concurrent transactions from interfering. The question asks which property would have prevented the interference, not which one was violated in the end.',
      vi: 'Đây là lost update, một race condition (time of check to time of use) giữa hai transaction. Không rule nào của database bắt được; isolation mới là cơ chế giữ cho các transaction chạy đồng thời không ảnh hưởng lẫn nhau. Câu hỏi là thuộc tính nào lẽ ra đã ngăn được sự ảnh hưởng đó, chứ không phải cuối cùng thuộc tính nào bị vi phạm.',
    },
    takeaway: {
      en: 'Concurrent transactions corrupting each other → isolation (locks, serializable).',
      vi: 'Transaction đồng thời làm hỏng nhau → isolation (lock, serializable).',
    },
    concepts: ['ACID', 'isolation', 'race condition', 'TOCTOU'],
  },
];
