// Hard-mode scenarios: every option is something a competent professional might do.
// The qualifier in the question (FIRST, BEST, MOST, GREATEST, NEXT) decides the answer.

import type { Scenario } from './scenarios.ts';

export const HARD_SCENARIOS: Scenario[] = [
  // ── Domain 1 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-acquisition-first-step',
    domainId: 'd1',
    alsoDomains: ['d6'],
    level: 'hard',
    title: { en: 'Connecting an acquired company', vi: 'Kết nối công ty vừa mua lại' },
    situation: {
      en: 'Your company has just closed the acquisition of a smaller competitor. The CIO wants a site-to-site VPN between the two networks within 30 days so that finance and sales can share systems. You know little about the acquired company\'s security program.',
      vi: 'Công ty bạn vừa chốt xong thương vụ mua lại một đối thủ nhỏ hơn. CIO muốn dựng site-to-site VPN giữa hai mạng trong vòng 30 ngày để finance và sales dùng chung hệ thống. Còn security program bên công ty kia ra sao thì bạn gần như chưa biết gì.',
    },
    question: { en: 'What should you do FIRST?', vi: 'Bạn nên làm gì TRƯỚC TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Run an authenticated vulnerability scan of the acquired company\'s network.', vi: 'Chạy authenticated vulnerability scan trên mạng của công ty vừa mua lại.' },
        why: {
          en: 'Useful input, but a scan is one technical activity inside an assessment. It says nothing about their policies, third parties, incidents or data, and it answers "what is broken" before you know "what matters".',
          vi: 'Có ích, nhưng scan chỉ là một hoạt động kỹ thuật nằm trong assessment. Nó không cho bạn biết gì về policy, bên thứ ba, sự cố hay dữ liệu bên đó, và nó trả lời câu "cái gì đang hỏng" trước khi bạn biết "cái gì quan trọng".',
        },
      },
      {
        id: 'B',
        text: { en: 'Perform a risk assessment of the acquired company\'s environment and security posture.', vi: 'Làm risk assessment cho môi trường và security posture của công ty vừa mua lại.' },
        why: {
          en: 'Correct. Every major business change starts with understanding risk. The assessment tells management what connecting the networks would expose and which controls must be in place first; scans and policy alignment are inputs to or results of it.',
          vi: 'Đúng. Thay đổi lớn nào trong kinh doanh cũng bắt đầu từ chỗ hiểu rõ risk. Assessment cho ban lãnh đạo thấy nối hai mạng lại sẽ phơi ra những gì và control nào phải có trước. Scan hay đồng bộ policy chỉ là đầu vào hoặc kết quả của nó.',
        },
      },
      {
        id: 'C',
        text: { en: 'Align the acquired company\'s security policies with yours.', vi: 'Đồng bộ security policy của công ty vừa mua lại theo policy bên bạn.' },
        why: {
          en: 'Needed eventually, but you cannot align what you have not assessed, and policy alignment alone does not make the connection safe in 30 days.',
          vi: 'Sớm muộn cũng phải làm, nhưng chưa assess thì lấy gì mà đồng bộ. Mà chỉ đồng bộ policy thôi thì cũng không làm kết nối an toàn được trong 30 ngày.',
        },
      },
      {
        id: 'D',
        text: { en: 'Rely on the acquired company\'s most recent external audit report and connect with standard firewall rules.', vi: 'Dựa vào báo cáo audit bên ngoài gần nhất của họ rồi kết nối với firewall rule chuẩn.' },
        why: {
          en: 'An existing audit is useful input, but it was scoped for their needs, may be months old, and was not about connecting to your network. Generic firewall rules do not reflect risks you have not assessed.',
          vi: 'Báo cáo audit có sẵn là đầu vào tốt, nhưng scope của nó phục vụ nhu cầu của họ, có thể đã cũ vài tháng, và không hề tính tới chuyện nối vào mạng của bạn. Firewall rule chung chung thì không phản ánh được những risk bạn chưa đánh giá.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'When all four options are reasonable, look for the one the others depend on. Mergers, new vendors, new systems and new markets all start with a risk assessment. Its results justify the scan, drive policy alignment, and tell senior management whether to connect now, connect with restrictions, or wait.',
      vi: 'Khi cả bốn đáp án đều hợp lý, hãy tìm cái mà ba cái còn lại phụ thuộc vào. Sáp nhập, vendor mới, hệ thống mới, thị trường mới đều bắt đầu bằng risk assessment. Kết quả của nó là lý do để chạy scan, là cơ sở để đồng bộ policy, và giúp ban lãnh đạo quyết định nối ngay, nối có giới hạn, hay chờ.',
    },
    takeaway: {
      en: 'Big business change + FIRST → risk assessment. Scans and policies come out of it.',
      vi: 'Thay đổi lớn trong kinh doanh + TRƯỚC TIÊN → risk assessment. Scan và policy đi ra từ kết quả của nó.',
    },
    concepts: ['mergers and acquisitions', 'risk assessment', 'third-party risk'],
  },
  {
    id: 'hard-bcp-next-step',
    domainId: 'd1',
    alsoDomains: ['d7'],
    level: 'hard',
    title: { en: 'The BCP team is in place', vi: 'Team BCP đã sẵn sàng' },
    situation: {
      en: 'Senior management has approved a business continuity project. The BCP team has been selected, its scope covers all three business units, and the CEO has signed the project charter. The team lead asks what to work on next.',
      vi: 'Ban lãnh đạo đã duyệt dự án business continuity. Team BCP đã chọn xong, scope bao trùm cả ba business unit, CEO cũng đã ký project charter. Trưởng team hỏi giờ làm gì tiếp.',
    },
    question: { en: 'What should the team do NEXT?', vi: 'Team nên làm gì TIẾP THEO?' },
    options: [
      {
        id: 'A',
        text: { en: 'Set the RTO and RPO for each critical system.', vi: 'Đặt RTO và RPO cho từng hệ thống critical.' },
        why: {
          en: 'RTO and RPO are outputs of the BIA, derived from each process\'s MTD. Setting them before the critical processes and their impact are identified is guessing. This is part of the right step, not the step itself.',
          vi: 'RTO và RPO là output của BIA, suy ra từ MTD của từng quy trình. Chưa xác định quy trình nào critical và tác động ra sao mà đã đặt thì chỉ là đoán. Đây là một phần của bước đúng, chứ không phải chính bước đó.',
        },
      },
      {
        id: 'B',
        text: { en: 'Choose between a warm site and a hot site.', vi: 'Chọn giữa warm site và hot site.' },
        why: {
          en: 'Site selection is a recovery strategy decision. It depends on recovery targets that have not been determined yet.',
          vi: 'Chọn site là quyết định thuộc recovery strategy. Nó phụ thuộc vào recovery target, mà mấy con số đó còn chưa có.',
        },
      },
      {
        id: 'C',
        text: { en: 'Conduct a business impact analysis.', vi: 'Làm business impact analysis.' },
        why: {
          en: 'Correct. With scope, team and sponsorship in place, the BIA is next: identify critical processes, their dependencies and the impact of losing them over time, which yields the MTD for each.',
          vi: 'Đúng. Đã có scope, team và người bảo trợ thì tiếp theo là BIA: xác định các quy trình critical, các phụ thuộc của chúng, và tác động khi mất chúng theo thời gian. Từ đó ra được MTD cho từng quy trình.',
        },
      },
      {
        id: 'D',
        text: { en: 'Identify preventive controls that reduce the impact of disruptions to critical systems.', vi: 'Xác định các preventive control giúp giảm tác động khi hệ thống critical bị gián đoạn.' },
        why: {
          en: 'Preventive controls protect the critical processes and systems the BIA identifies. Before the BIA you do not yet know which ones are critical.',
          vi: 'Preventive control dùng để bảo vệ những quy trình và hệ thống critical mà BIA chỉ ra. Chưa làm BIA thì bạn còn chưa biết cái nào là critical.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Order questions are about what each step produces for the next. Project initiation (scope, team, sponsorship) → BIA (critical processes, impact over time, MTD, and from it RTO and RPO) → preventive controls and recovery strategy (site type, backup approach) → plan development → testing, training and maintenance. Every option here belongs in BCP; only the BIA is next, and setting RTO/RPO happens inside it.',
      vi: 'Câu hỏi về thứ tự thực ra là hỏi mỗi bước tạo ra gì cho bước sau. Khởi động dự án (scope, team, bảo trợ) → BIA (quy trình critical, tác động theo thời gian, MTD, rồi từ đó ra RTO và RPO) → preventive control và recovery strategy (loại site, cách backup) → xây dựng plan → test, đào tạo và bảo trì. Đáp án nào ở đây cũng thuộc BCP, nhưng chỉ BIA là bước tiếp theo, còn đặt RTO/RPO thì nằm bên trong BIA.',
    },
    takeaway: {
      en: 'BCP: initiate → BIA (MTD → RTO/RPO) → controls and strategy → plan → test.',
      vi: 'BCP: khởi động → BIA (MTD → RTO/RPO) → control và strategy → plan → test.',
    },
    concepts: ['BCP', 'BIA', 'MTD', 'process order'],
  },

  // ── Domain 2 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-prod-data-in-test',
    domainId: 'd2',
    alsoDomains: ['d8'],
    level: 'hard',
    title: { en: 'A production copy for testing', vi: 'Bản copy production để test' },
    situation: {
      en: 'A developer copied 50,000 customer records, classified Confidential, from production into the shared test environment to reproduce a bug. The shared test environment is open to the whole development team. The data owner was not asked.',
      vi: 'Một developer copy 50.000 bản ghi khách hàng, classification Confidential, từ production sang môi trường test dùng chung để reproduce một bug. Môi trường test này cả team dev đều vào được. Còn data owner thì không hề được hỏi.',
    },
    question: { en: 'What is the GREATEST concern?', vi: 'Đâu là mối lo LỚN NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'The data owner did not approve the copy.', vi: 'Data owner không duyệt bản copy này.' },
        why: {
          en: 'A real process failure, but approval alone would not have protected anything. Even an approved copy in this environment would be exposed.',
          vi: 'Quy trình bị bỏ qua thật, nhưng có approval thôi thì cũng chẳng bảo vệ được gì. Dù được duyệt, bản copy nằm trong môi trường này vẫn bị lộ như thường.',
        },
      },
      {
        id: 'B',
        text: { en: 'Confidential data now sits in an environment whose controls do not match its classification.', vi: 'Dữ liệu Confidential giờ nằm trong môi trường có control không tương xứng với classification của nó.' },
        why: {
          en: 'Correct. Classification travels with the data. Copying it somewhere with weaker controls creates a real disclosure risk right now, which outweighs the policy breach that caused it.',
          vi: 'Đúng. Classification đi theo dữ liệu. Copy sang chỗ có control yếu hơn là tạo ra risk lộ dữ liệu ngay lúc này, nặng hơn cái vi phạm policy đã dẫn tới nó.',
        },
      },
      {
        id: 'C',
        text: { en: 'The copy is outside the retention schedule because nobody is tracking it.', vi: 'Bản copy nằm ngoài retention schedule vì không ai theo dõi nó.' },
        why: {
          en: 'Untracked copies do break retention and disposal, but that is a longer-term governance problem compared with the exposure.',
          vi: 'Bản copy không ai theo dõi thì phá retention và disposal thật, nhưng so với chuyện dữ liệu đang bị lộ thì đó là vấn đề governance về lâu dài.',
        },
      },
      {
        id: 'D',
        text: { en: 'Developers now have access to production customer data, breaking the separation between development and production.', vi: 'Developer giờ truy cập được dữ liệu khách hàng production, phá vỡ sự tách biệt giữa dev và production.' },
        why: {
          en: 'A real control failure, but it describes one part of the exposure (who can now see the data). The broader issue, which includes it, is that the data now lives without the protection its classification requires.',
          vi: 'Control bị hỏng thật, nhưng nó chỉ nói lên một phần của chuyện lộ dữ liệu (ai giờ thấy được dữ liệu). Vấn đề rộng hơn, bao gồm luôn điểm này, là dữ liệu đang nằm ở chỗ không có mức bảo vệ mà classification của nó đòi hỏi.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: '"GREATEST concern" asks which consequence carries the most risk. Data must be protected according to its classification wherever it is copied. The usual fix is to keep production data out of test entirely by using masked, tokenised or synthetic data, and to treat any unavoidable copy as production.',
      vi: '"Mối lo LỚN NHẤT" là hỏi hậu quả nào mang nhiều risk nhất. Copy dữ liệu đi đâu thì vẫn phải bảo vệ nó theo classification. Cách xử lý thường gặp là không đưa dữ liệu production vào test luôn, mà dùng dữ liệu đã mask, tokenize hoặc dữ liệu synthetic; bản copy nào bắt buộc phải có thì bảo vệ y như production.',
    },
    takeaway: {
      en: 'Classification follows the data. Production data in test → mask it or protect it as production.',
      vi: 'Classification đi theo dữ liệu. Dữ liệu production nằm trong test → mask đi, hoặc bảo vệ y như production.',
    },
    concepts: ['classification', 'test data', 'data masking'],
  },
  {
    id: 'hard-dlp-first-step',
    domainId: 'd2',
    alsoDomains: ['d7'],
    level: 'hard',
    title: { en: 'Rolling out DLP', vi: 'Triển khai DLP' },
    situation: {
      en: 'After a customer list was emailed to a personal account, the board approved a data loss prevention project. The company already has an approved data classification policy. The vendor is ready to install agents next week, legal wants a policy first, and HR wants staff training.',
      vi: 'Sau vụ một danh sách khách hàng bị gửi email về account cá nhân, board đã duyệt dự án data loss prevention. Công ty đã có sẵn data classification policy được phê duyệt. Vendor sẵn sàng cài agent tuần sau, legal muốn có policy trước, còn HR thì muốn đào tạo nhân viên.',
    },
    question: { en: 'What should be done FIRST?', vi: 'Nên làm gì TRƯỚC TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Deploy the DLP agents in monitor-only mode first to see what data actually moves where.', vi: 'Triển khai DLP agent ở chế độ monitor-only trước để xem dữ liệu thực tế đi đâu.' },
        why: {
          en: 'Monitor mode is a sensible rollout step, but DLP rules need to know what sensitive data looks like and where it lives. Without that, monitoring produces noise.',
          vi: 'Chạy monitor mode là một bước rollout hợp lý, nhưng rule DLP cần biết dữ liệu nhạy cảm trông thế nào và nằm ở đâu. Không có cái đó thì monitor chỉ ra một đống noise.',
        },
      },
      {
        id: 'B',
        text: { en: 'Write the data protection policy that the DLP will enforce.', vi: 'Viết data protection policy để DLP thực thi.' },
        why: {
          en: 'Close, and policy-first is a good reflex. But the classification policy already exists, and DLP rules written now still would not know where the sensitive data actually is or who owns it.',
          vi: 'Sát rồi, và phản xạ làm policy trước là tốt. Nhưng classification policy thì đã có sẵn, còn rule DLP viết lúc này vẫn chưa biết dữ liệu nhạy cảm thực sự nằm ở đâu hay ai là owner.',
        },
      },
      {
        id: 'C',
        text: { en: 'Train staff on acceptable handling of customer data.', vi: 'Đào tạo nhân viên cách xử lý dữ liệu khách hàng cho đúng.' },
        why: {
          en: 'Training reduces mistakes, but it is not the foundation the DLP project needs, and it should reflect the policy that does not exist yet.',
          vi: 'Đào tạo giúp giảm sai sót, nhưng không phải nền móng mà dự án DLP cần. Nội dung đào tạo cũng phải bám theo policy, mà policy đó còn chưa có.',
        },
      },
      {
        id: 'D',
        text: { en: 'Find and classify the sensitive data, where it lives and who owns it.', vi: 'Tìm và phân loại dữ liệu nhạy cảm, xem nó nằm ở đâu và ai là owner.' },
        why: {
          en: 'Correct. You cannot protect what you have not found. Discovery and classification give the policy its content and the DLP its rules.',
          vi: 'Đúng. Chưa tìm ra thì không bảo vệ được. Discovery và classification cho policy có nội dung, và cho DLP có rule.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Asset security starts with inventory and classification. The sequence for a DLP program is: discover and classify data with its owners → define policy → configure and tune the tool (often in monitor mode first) → train users → enforce and review.',
      vi: 'Asset security bắt đầu từ inventory và classification. Thứ tự cho một chương trình DLP: tìm và phân loại dữ liệu cùng owner → định ra policy → cấu hình và tinh chỉnh tool (thường chạy monitor mode trước) → đào tạo người dùng → enforce và review.',
    },
    takeaway: {
      en: 'Any data protection project: find and classify the data FIRST.',
      vi: 'Dự án bảo vệ dữ liệu nào cũng vậy: tìm và phân loại dữ liệu TRƯỚC TIÊN.',
    },
    concepts: ['DLP', 'data discovery', 'classification'],
  },

  // ── Domain 3 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-cloud-key-control',
    domainId: 'd3',
    alsoDomains: ['d2'],
    level: 'hard',
    title: { en: 'Keeping the cloud provider out', vi: 'Không cho cloud provider đọc dữ liệu' },
    situation: {
      en: 'Legal requires that the staff of your SaaS document platform must never be able to read your contract files, and that your company can make the data unreadable immediately, without the provider\'s help, if the relationship ends badly.',
      vi: 'Legal đưa ra hai yêu cầu. Một, nhân viên của nền tảng SaaS quản lý tài liệu mà công ty đang dùng không bao giờ được đọc file hợp đồng của bạn. Hai, nếu quan hệ đổ vỡ thì công ty phải tự làm cho dữ liệu không đọc được ngay lập tức, không cần provider giúp.',
    },
    question: { en: 'Which approach BEST meets both requirements?', vi: 'Cách nào đáp ứng cả hai yêu cầu TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Provider-managed encryption at rest with AES-256.', vi: 'Mã hóa at rest bằng AES-256 với khóa do provider quản lý.' },
        why: {
          en: 'Protects against stolen disks, but the provider holds the keys, so its staff and systems can decrypt.',
          vi: 'Chống được chuyện mất ổ đĩa, nhưng khóa nằm trong tay provider, nên nhân viên và hệ thống của họ vẫn giải mã được.',
        },
      },
      {
        id: 'B',
        text: { en: 'Customer-managed keys (BYOK) stored in the provider\'s key management service.', vi: 'Customer-managed key (BYOK) lưu trong key management service của provider.' },
        why: {
          en: 'A real improvement: you control rotation and can disable the key. But the key lives and is used inside the provider\'s platform, so the provider can still decrypt while it is active.',
          vi: 'Có cải thiện thật: bạn kiểm soát rotation và có thể disable khóa. Nhưng khóa nằm và được dùng ngay trong nền tảng của provider, nên khi khóa còn active thì provider vẫn giải mã được.',
        },
      },
      {
        id: 'C',
        text: { en: 'Encrypt files client-side with keys held in your own HSM before upload.', vi: 'Mã hóa file phía client bằng khóa giữ trong HSM của bạn trước khi upload.' },
        why: {
          en: 'Correct. The provider only ever stores ciphertext and never sees the keys. Destroying or revoking keys in your HSM makes the data unreadable without involving the provider.',
          vi: 'Đúng. Provider chỉ lưu ciphertext và không bao giờ thấy khóa. Hủy hoặc revoke khóa trong HSM của bạn là dữ liệu không đọc được nữa, không cần provider nhúng tay.',
        },
      },
      {
        id: 'D',
        text: { en: 'Contract clauses forbidding provider staff access, with a right to audit and certified destruction on exit.', vi: 'Điều khoản hợp đồng cấm nhân viên provider truy cập, kèm quyền audit và xác nhận tiêu hủy khi chấm dứt.' },
        why: {
          en: 'Valuable and often required, but it relies on the provider keeping its promise, and certified destruction still needs the provider\'s help. Neither requirement is enforced technically.',
          vi: 'Có giá trị và thường là bắt buộc, nhưng nó trông vào chuyện provider giữ lời, mà tiêu hủy có xác nhận thì vẫn phải nhờ provider làm. Không yêu cầu nào được thực thi bằng kỹ thuật cả.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Who holds the key decides who can read the data. Provider-managed keys: provider can read. BYOK: you own the key material and lifecycle, but it is used inside the provider. Client-side encryption or "hold your own key": only you can decrypt. The trade-off is that the SaaS can no longer search or process the content.',
      vi: 'Ai giữ khóa thì người đó đọc được dữ liệu. Khóa do provider quản lý: provider đọc được. BYOK: bạn sở hữu key material và vòng đời khóa, nhưng khóa vẫn được dùng bên trong provider. Mã hóa phía client hay "hold your own key": chỉ bạn giải mã được. Cái giá phải trả là SaaS không còn search hay xử lý được nội dung nữa.',
    },
    takeaway: {
      en: 'Provider must never read it → keys never leave you → client-side encryption.',
      vi: 'Provider không bao giờ được đọc → khóa không bao giờ rời tay bạn → mã hóa phía client.',
    },
    concepts: ['key management', 'BYOK', 'client-side encryption', 'cloud'],
  },
  {
    id: 'hard-clark-wilson',
    domainId: 'd3',
    level: 'hard',
    title: { en: 'Tellers and transfers', vi: 'Giao dịch viên và lệnh chuyển tiền' },
    situation: {
      en: 'A bank is redesigning its core system. Tellers must never edit account balances directly; every change must go through approved transaction programs that log what happened. A transfer above $10,000 must be entered by one person and approved by another.',
      vi: 'Một ngân hàng đang thiết kế lại core system. Giao dịch viên không bao giờ được sửa số dư tài khoản trực tiếp; mọi thay đổi phải đi qua các chương trình giao dịch đã duyệt, có ghi log lại. Lệnh chuyển tiền trên $10.000 thì một người nhập, một người khác duyệt.',
    },
    question: { en: 'Which security model BEST describes these requirements?', vi: 'Security model nào mô tả các yêu cầu này TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Biba', vi: 'Biba' },
        why: {
          en: 'Biba is an integrity model too, so it is tempting. But it works with integrity levels (no read down, no write up) and says nothing about access only through programs or separation of duties.',
          vi: 'Biba cũng là integrity model nên rất dễ bị dụ. Nhưng Biba làm việc với integrity level (no read down, no write up) và không nói gì đến chuyện chỉ truy cập qua chương trình hay separation of duties.',
        },
      },
      {
        id: 'B',
        text: { en: 'Bell-LaPadula', vi: 'Bell-LaPadula' },
        why: {
          en: 'A confidentiality model based on clearances and classifications. These requirements are about integrity of balances.',
          vi: 'Đây là model về confidentiality, dựa trên clearance và classification. Còn yêu cầu ở đây là integrity của số dư.',
        },
      },
      {
        id: 'C',
        text: { en: 'Graham-Denning', vi: 'Graham-Denning' },
        why: {
          en: 'Graham-Denning defines how subjects create, delete and transfer rights over objects. It sounds administrative, but it has no notion of well-formed transactions or separation of duties.',
          vi: 'Graham-Denning định nghĩa cách subject tạo, xóa và chuyển quyền trên object. Nghe có vẻ dính tới quản trị, nhưng nó không có khái niệm well-formed transaction hay separation of duties.',
        },
      },
      {
        id: 'D',
        text: { en: 'Clark-Wilson', vi: 'Clark-Wilson' },
        why: {
          en: 'Correct. Clark-Wilson uses the access triple (user → transformation procedure → constrained data item), well-formed transactions, auditing and separation of duties. That is exactly this design.',
          vi: 'Đúng. Clark-Wilson dùng access triple (user → transformation procedure → constrained data item), well-formed transaction, audit và separation of duties. Khớp y thiết kế này.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Both Biba and Clark-Wilson protect integrity; the details decide. Biba: integrity levels, mostly theoretical. Clark-Wilson: commercial integrity, where users reach data only through certified programs (TPs) that keep constrained data items (CDIs) valid, with logging and separation of duties.',
      vi: 'Biba và Clark-Wilson đều bảo vệ integrity; chi tiết mới là cái quyết định. Biba: integrity level, chủ yếu mang tính lý thuyết. Clark-Wilson: integrity trong môi trường thương mại, user chỉ chạm tới dữ liệu qua các chương trình đã certify (TP) giữ cho constrained data item (CDI) luôn hợp lệ, kèm logging và separation of duties.',
    },
    takeaway: {
      en: 'Integrity + programs as the only path + separation of duties → Clark-Wilson.',
      vi: 'Integrity + chỉ đi qua chương trình + separation of duties → Clark-Wilson.',
    },
    concepts: ['Clark-Wilson', 'Biba', 'separation of duties'],
  },

  // ── Domain 4 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-arp-spoofing',
    domainId: 'd4',
    alsoDomains: ['d7'],
    level: 'hard',
    title: { en: 'Certificate warnings on the office LAN', vi: 'Cảnh báo certificate trên LAN văn phòng' },
    situation: {
      en: 'Several users on one office floor, all on the same VLAN, report browser certificate warnings when opening the internal HR portal. Users on other floors see no warnings. On an affected PC, `arp -a` lists the default gateway and 10.1.3.57, a colleague\'s workstation, with the same MAC address.',
      vi: 'Một số user ở cùng một tầng, cùng một VLAN, báo trình duyệt hiện cảnh báo certificate khi mở HR portal nội bộ. User ở các tầng khác thì không thấy gì. Trên một máy bị ảnh hưởng, `arp -a` cho thấy default gateway và 10.1.3.57 (máy trạm của một đồng nghiệp) có cùng MAC address.',
    },
    question: { en: 'What is MOST likely happening?', vi: 'KHẢ NĂNG CAO NHẤT là chuyện gì đang xảy ra?' },
    options: [
      {
        id: 'A',
        text: { en: 'DNS cache poisoning is sending those users to a fake copy of the HR portal.', vi: 'DNS cache poisoning đang đưa các user đó tới một bản giả của HR portal.' },
        why: {
          en: 'DNS poisoning would also cause certificate warnings, but it changes name resolution, not the MAC address of the default gateway, and would not be limited to one floor\'s segment.',
          vi: 'DNS poisoning cũng gây cảnh báo certificate, nhưng nó đổi kết quả phân giải tên chứ không đổi MAC address của default gateway, và cũng không chỉ gói gọn trong segment của một tầng.',
        },
      },
      {
        id: 'B',
        text: { en: 'The HR portal\'s certificate has expired.', vi: 'Certificate của HR portal đã hết hạn.' },
        why: {
          en: 'An expired certificate would warn every user on every floor, and would not change anyone\'s ARP table.',
          vi: 'Certificate hết hạn thì user ở tầng nào cũng bị cảnh báo, và cũng không làm ARP table của ai thay đổi.',
        },
      },
      {
        id: 'C',
        text: { en: 'ARP cache poisoning enabling a man-in-the-middle on that VLAN.', vi: 'ARP cache poisoning, mở đường cho man-in-the-middle trong VLAN đó.' },
        why: {
          en: 'Correct. The gateway IP resolving to a workstation\'s MAC is the signature of ARP cache poisoning. The attacker relays traffic and presents its own certificate, hence the warnings, only on that broadcast domain.',
          vi: 'Đúng. IP của gateway resolve ra MAC của một máy trạm là dấu hiệu điển hình của ARP cache poisoning. Attacker relay traffic và đưa ra certificate của chính nó, nên mới có cảnh báo, và chỉ trong broadcast domain đó.',
        },
      },
      {
        id: 'D',
        text: { en: 'A rogue DHCP server is handing out a fake gateway.', vi: 'Một rogue DHCP server đang phát ra gateway giả.' },
        why: {
          en: 'A rogue DHCP server would hand out a different gateway IP address. Here the gateway IP is correct; only its MAC mapping is wrong.',
          vi: 'Rogue DHCP server sẽ phát ra một IP gateway khác. Ở đây IP gateway vẫn đúng, chỉ có MAC map với nó là sai.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'Read every clue: warnings only on one segment, correct gateway IP, wrong MAC. That points to layer 2. Defences include dynamic ARP inspection with DHCP snooping on switches, 802.1X port authentication, and static entries for critical hosts. For the incident: isolate the offending port, preserve evidence from that workstation, and check what was intercepted.',
      vi: 'Đọc hết các manh mối: cảnh báo chỉ có ở một segment, IP gateway đúng, MAC sai. Tất cả đều chỉ về layer 2. Cách phòng: bật dynamic ARP inspection cùng DHCP snooping trên switch, 802.1X port authentication, và static entry cho các host quan trọng. Còn với sự cố này: cô lập port gây ra, giữ evidence trên máy trạm đó, rồi kiểm tra xem những gì đã bị intercept.',
    },
    takeaway: {
      en: 'Right IP, wrong MAC, one segment → ARP poisoning (layer 2), not DNS.',
      vi: 'IP đúng, MAC sai, một segment → ARP poisoning (layer 2), không phải DNS.',
    },
    concepts: ['ARP spoofing', 'man-in-the-middle', 'dynamic ARP inspection'],
  },
  {
    id: 'hard-lateral-movement',
    domainId: 'd4',
    alsoDomains: ['d5'],
    level: 'hard',
    title: { en: 'From one phished laptop to the whole network', vi: 'Từ một laptop dính phishing tới cả mạng' },
    situation: {
      en: 'A red team phished one sales employee and, from that laptop, reached file servers, the finance database and a domain controller within two hours. Every VLAN can reach every server on any port. Management asks for the control that would most limit this in the future.',
      vi: 'Red team phishing một nhân viên sales, rồi từ laptop đó vào được file server, database finance và một domain controller chỉ trong hai tiếng. VLAN nào cũng tới được server nào, port nào cũng được. Ban lãnh đạo muốn biết control nào hạn chế được chuyện này nhiều nhất về sau.',
    },
    question: { en: 'Which control would BEST limit lateral movement?', vi: 'Control nào hạn chế lateral movement TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Deploy EDR on all endpoints and servers.', vi: 'Triển khai EDR trên toàn bộ endpoint và server.' },
        why: {
          en: 'EDR improves detection and response and may stop known techniques, but it does not change what a compromised machine is allowed to reach.',
          vi: 'EDR giúp phát hiện và phản ứng tốt hơn, có thể chặn được các kỹ thuật đã biết, nhưng không thu hẹp những chỗ mà một máy bị chiếm được phép kết nối tới.',
        },
      },
      {
        id: 'B',
        text: { en: 'Run phishing simulations and training every quarter.', vi: 'Chạy phishing simulation và đào tạo mỗi quý.' },
        why: {
          en: 'Reduces the chance of the first compromise. The question is about what happens after it, and some user will always click.',
          vi: 'Giảm khả năng bị chiếm máy đầu tiên. Nhưng câu hỏi là về chuyện xảy ra sau đó, mà kiểu gì cũng sẽ có user click.',
        },
      },
      {
        id: 'C',
        text: { en: 'Remove local admin rights and adopt a tiered admin model for privileged accounts.', vi: 'Gỡ quyền local admin và áp dụng tiered admin model cho các privileged account.' },
        why: {
          en: 'A strong control against credential theft, which is how attackers usually climb to domain admin. But the laptop could still reach the file servers and the finance database directly; it does not change what a compromised machine can talk to.',
          vi: 'Control mạnh để chống trộm credential, cách attacker hay dùng để leo lên domain admin. Nhưng laptop vẫn tới thẳng file server và database finance được; nó không thay đổi chuyện máy bị chiếm nói chuyện được với những gì.',
        },
      },
      {
        id: 'D',
        text: { en: 'Microsegmentation with identity-based access between users and servers.', vi: 'Microsegmentation với truy cập dựa trên identity giữa user và server.' },
        why: {
          en: 'Correct. Segmentation and least-privilege access in the internal network (a zero trust approach) mean a compromised laptop can only reach what that user actually needs.',
          vi: 'Đúng. Segmentation và least privilege trong mạng nội bộ (hướng zero trust) nghĩa là laptop bị chiếm chỉ tới được những gì user đó thực sự cần.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Match the control to the attack stage named in the question. Training targets initial access, EDR targets detection, admin tiering targets privilege escalation. "Lateral movement" is about internal reachability, so the best control limits internal paths: segmentation, least privilege and per-request verification. In practice you want all four; the exam asks which fits the stated problem best.',
      vi: 'Chọn control khớp với giai đoạn tấn công mà câu hỏi nêu. Đào tạo nhắm vào initial access, EDR nhắm vào phát hiện, admin tiering nhắm vào privilege escalation. "Lateral movement" là chuyện tới được đâu trong mạng nội bộ, nên control tốt nhất là cái thu hẹp đường đi nội bộ: segmentation, least privilege và xác minh từng request. Thực tế thì bạn muốn có cả bốn; đề thi chỉ hỏi cái nào khớp nhất với vấn đề đã nêu.',
    },
    takeaway: {
      en: 'Lateral movement → limit east-west reachability (segmentation, zero trust).',
      vi: 'Lateral movement → hạn chế đường đi east-west (segmentation, zero trust).',
    },
    concepts: ['lateral movement', 'microsegmentation', 'zero trust'],
  },

  // ── Domain 5 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-abac-nurses',
    domainId: 'd5',
    level: 'hard',
    title: { en: 'Nurses, wards and shifts', vi: 'Điều dưỡng, khoa và ca trực' },
    situation: {
      en: 'A hospital wants nurses to open the records only of patients currently admitted to their own ward, only during their scheduled shift, and only from hospital-managed workstations. Doctors on call need similar rules with different conditions.',
      vi: 'Bệnh viện muốn điều dưỡng chỉ mở được hồ sơ của bệnh nhân đang nằm tại khoa mình, chỉ trong ca trực đã xếp lịch, và chỉ từ máy trạm do bệnh viện quản lý. Bác sĩ trực cũng cần bộ rule tương tự, chỉ khác điều kiện.',
    },
    question: { en: 'Which access control model BEST supports these rules?', vi: 'Access control model nào đáp ứng các rule này TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Role-based access control (RBAC)', vi: 'Role-based access control (RBAC)' },
        why: {
          en: 'Roles like "Nurse" are part of the answer, but RBAC alone cannot express ward, time of shift and device. You would need a role per ward per shift per device, which explodes.',
          vi: 'Chưa đủ. Role kiểu “Điều dưỡng” là một phần của lời giải, nhưng chỉ dùng RBAC thì không diễn tả được khoa, ca trực và thiết bị. Bạn sẽ phải tạo role cho từng khoa, từng ca, từng loại thiết bị, và số role sẽ bùng nổ.',
        },
      },
      {
        id: 'B',
        text: { en: 'Attribute-based access control (ABAC)', vi: 'Attribute-based access control (ABAC)' },
        why: {
          en: 'Correct. ABAC evaluates attributes of the user (role, ward), the resource (patient\'s ward), and the environment (time, device) in one policy, which is exactly this requirement.',
          vi: 'Đúng. ABAC đánh giá cùng lúc attribute của người dùng (role, khoa), của tài nguyên (khoa của bệnh nhân) và của môi trường (giờ, thiết bị) trong một policy, đúng y yêu cầu ở đây.',
        },
      },
      {
        id: 'C',
        text: { en: 'Risk-based (adaptive) access control', vi: 'Risk-based (adaptive) access control' },
        why: {
          en: 'Adaptive access weighs device, location and time to score a login, so it looks close. But it decides how much to trust a session, not whether this nurse\'s ward matches this patient\'s ward.',
          vi: 'Nghe rất gần nhưng lệch. Adaptive access cân thiết bị, vị trí, thời gian để chấm điểm một lần đăng nhập. Nó quyết định nên tin session này tới mức nào, chứ không kiểm tra khoa của điều dưỡng này có khớp với khoa của bệnh nhân kia không.',
        },
      },
      {
        id: 'D',
        text: { en: 'Rule-based access control', vi: 'Rule-based access control' },
        why: {
          en: 'Global rules such as time-of-day can cover part of it, but rule-based models apply the same rules to everyone and do not combine user and resource attributes per request.',
          vi: 'Chỉ được một phần. Rule áp chung như giới hạn theo giờ thì làm được, nhưng rule-based áp cùng một bộ rule cho mọi người và không kết hợp attribute của user với attribute của tài nguyên theo từng request.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'DAC: the owner decides. MAC: labels and clearances. RBAC: permissions by job role. Rule-based: global conditions. Risk-based: trust adjusted by a risk score. ABAC: policies over many attributes of subject, object and environment. When a question lists several conditions that must all hold at once, ABAC is usually the best fit.',
      vi: 'DAC: owner quyết định. MAC: label và clearance. RBAC: quyền theo vai trò công việc. Rule-based: điều kiện áp chung cho tất cả. Risk-based: mức tin cậy điều chỉnh theo risk score. ABAC: policy dựa trên nhiều attribute của subject, object và môi trường. Đề nào liệt kê nhiều điều kiện phải thỏa cùng lúc thì ABAC thường là đáp án hợp nhất.',
    },
    takeaway: {
      en: 'Who + what + when + where in one decision → ABAC.',
      vi: 'Ai + cái gì + khi nào + ở đâu trong cùng một quyết định → ABAC.',
    },
    concepts: ['ABAC', 'RBAC', 'access control models'],
  },
  {
    id: 'hard-sso-must-have',
    domainId: 'd5',
    alsoDomains: ['d3'],
    level: 'hard',
    title: { en: 'One login for 200 applications', vi: 'Một lần đăng nhập cho 200 ứng dụng' },
    situation: {
      en: 'Your company is moving 200 internal and SaaS applications behind a single sign-on identity provider. The project plan already includes password complexity rules, a 30-minute session timeout and quarterly access reviews.',
      vi: 'Công ty bạn đang đưa 200 ứng dụng nội bộ và SaaS về sau một IdP để dùng SSO. Kế hoạch dự án đã có rule độ phức tạp mật khẩu, session timeout 30 phút và access review hàng quý.',
    },
    question: { en: 'Which additional security control is MOST important for this rollout?', vi: 'Security control bổ sung nào QUAN TRỌNG NHẤT cho đợt triển khai này?' },
    options: [
      {
        id: 'A',
        text: { en: 'A high-availability, multi-region deployment of the identity provider.', vi: 'IdP chạy high availability, triển khai trên nhiều region.' },
        why: {
          en: 'Important: if the IdP is down, nobody can work. But an outage stops work, while a stolen credential exposes all 200 applications. The confidentiality risk is the larger one and is the classic SSO weakness.',
          vi: 'Quan trọng thật: IdP sập là cả công ty ngồi chơi. Nhưng sự cố này chỉ làm dừng việc, còn một credential bị đánh cắp thì lộ cả 200 ứng dụng. Rủi ro về confidentiality lớn hơn, và đó mới là điểm yếu kinh điển của SSO.',
        },
      },
      {
        id: 'B',
        text: { en: 'Strong multi-factor authentication at the identity provider.', vi: 'MFA mạnh, áp dụng ngay tại tầng IdP.' },
        why: {
          en: 'Correct. SSO concentrates access into one credential. MFA at the IdP, ideally phishing-resistant, is the control that keeps one stolen password from opening everything.',
          vi: 'Đúng. SSO dồn toàn bộ quyền truy cập vào một credential. MFA tại IdP, tốt nhất là loại chống được phishing, là control giữ cho một mật khẩu bị lộ không mở được mọi cửa.',
        },
      },
      {
        id: 'C',
        text: { en: 'Automated provisioning and deprovisioning (SCIM) tied to HR records.', vi: 'Tự động provisioning/deprovisioning (SCIM) gắn với dữ liệu HR.' },
        why: {
          en: 'Valuable: leavers lose access to all 200 apps at once. But it does not protect the active credentials that now open everything.',
          vi: 'Có giá trị: người nghỉ việc mất quyền vào cả 200 app cùng lúc. Nhưng nó không bảo vệ các credential đang hoạt động, thứ giờ mở được tất cả.',
        },
      },
      {
        id: 'D',
        text: { en: 'Centralised logging and anomaly alerts on identity provider sign-ins.', vi: 'Log tập trung và cảnh báo bất thường cho các lần đăng nhập IdP.' },
        why: {
          en: 'Detects misuse once it starts. Stopping a stolen password from working at all comes first.',
          vi: 'Cái này chỉ phát hiện khi việc lạm dụng đã bắt đầu. Chặn để mật khẩu bị đánh cắp không dùng được ngay từ đầu mới là việc phải làm trước.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'SSO improves usability and central control but creates a single point of compromise: one credential, all applications. The control that directly offsets that is strong authentication at the IdP. Availability (A) is the second classic SSO risk and also needs addressing, but when asked for the MOST important addition for security, protect the credential.',
      vi: 'SSO giúp người dùng tiện hơn và quản lý tập trung hơn, nhưng cũng tạo ra single point of compromise: một credential, mọi ứng dụng. Control bù trực tiếp cho điểm này là xác thực mạnh tại IdP. Availability (A) là rủi ro kinh điển thứ hai của SSO và cũng phải xử lý, nhưng khi đề hỏi control bổ sung QUAN TRỌNG NHẤT về bảo mật thì hãy bảo vệ credential.',
    },
    takeaway: {
      en: 'SSO = keys to the kingdom. Pair it with strong MFA at the IdP.',
      vi: 'SSO = chìa khóa vạn năng. Phải đi kèm MFA mạnh tại IdP.',
    },
    concepts: ['SSO', 'MFA', 'identity provider'],
  },

  // ── Domain 6 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-audit-independence',
    domainId: 'd6',
    alsoDomains: ['d1'],
    level: 'hard',
    title: { en: 'Who should audit the security team?', vi: 'Ai nên audit team security?' },
    situation: {
      en: 'The board wants an objective view of whether the security team\'s controls actually work. The CISO reports to the CIO. Four proposals are on the table.',
      vi: 'Board muốn có một góc nhìn khách quan xem các control của team security có thực sự hiệu quả không. CISO đang report cho CIO. Trên bàn có bốn đề xuất.',
    },
    question: { en: 'Which arrangement provides the MOST objective assessment?', vi: 'Phương án nào cho kết quả đánh giá KHÁCH QUAN NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'An external penetration testing firm hired and managed by the CISO.', vi: 'Một công ty pentest bên ngoài, do CISO thuê và quản lý.' },
        why: {
          en: 'External and skilled, but engaged and directed by the person whose controls are being assessed. The CISO controls scope and the report goes to the CISO first.',
          vi: 'Bên ngoài và có năng lực, nhưng lại do chính người có control đang bị đánh giá thuê và điều phối. CISO nắm scope, và báo cáo về tay CISO trước.',
        },
      },
      {
        id: 'B',
        text: { en: 'A detailed self-assessment by the security team against ISO 27001.', vi: 'Team security tự đánh giá chi tiết theo ISO 27001.' },
        why: {
          en: 'Useful for preparation, but people assessing their own work is the least independent option.',
          vi: 'Hữu ích để chuẩn bị, nhưng tự chấm bài của chính mình là phương án kém độc lập nhất.',
        },
      },
      {
        id: 'C',
        text: { en: 'Internal audit, reporting directly to the board\'s audit committee.', vi: 'Internal audit, report thẳng lên audit committee của board.' },
        why: {
          en: 'Correct. Independence comes from the reporting line. Internal audit that reports to the audit committee is outside the security team\'s management chain, and the results go straight to the board.',
          vi: 'Đúng. Tính độc lập đến từ reporting line. Internal audit report cho audit committee thì nằm ngoài chuỗi quản lý của team security, và kết quả đi thẳng lên board.',
        },
      },
      {
        id: 'D',
        text: { en: 'An ISO 27001 certification audit by an accredited firm, commissioned and scoped by the CIO.', vi: 'Audit chứng nhận ISO 27001 do một công ty được công nhận thực hiện, CIO thuê và chốt scope.' },
        why: {
          en: 'Accredited and external, but the CIO who commissions and scopes it sits in the management chain being assessed. Certification also checks the management system against the standard rather than whether specific controls work.',
          vi: 'Có accreditation và là bên ngoài, nhưng CIO, người thuê và chốt scope, lại nằm trong chính chuỗi quản lý đang bị đánh giá. Hơn nữa audit chứng nhận chỉ xem hệ thống quản lý có khớp tiêu chuẩn không, chứ không xem từng control cụ thể có chạy hiệu quả không.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: '"External" is not the same as "independent". Objectivity depends on who commissions the work, who sets the scope and who receives the results. The strongest arrangement is an assessor outside the audited function reporting to governance (audit committee or board). An external firm engaged by the audit committee would be equally good; one engaged by the CISO is not.',
      vi: '“Bên ngoài” không có nghĩa là “độc lập”. Tính khách quan phụ thuộc vào ai thuê, ai chốt scope và ai nhận kết quả. Mạnh nhất là người đánh giá nằm ngoài bộ phận bị audit và report lên tầng governance (audit committee hoặc board). Một công ty bên ngoài do audit committee thuê cũng tốt ngang vậy; còn do CISO thuê thì không.',
    },
    takeaway: {
      en: 'Independence = reporting line. Who hires and who reads the report matters more than "external".',
      vi: 'Độc lập = reporting line. Ai thuê và ai đọc báo cáo quan trọng hơn chữ “bên ngoài”.',
    },
    concepts: ['audit independence', 'internal audit', 'governance'],
  },
  {
    id: 'hard-business-logic-testing',
    domainId: 'd6',
    alsoDomains: ['d8'],
    level: 'hard',
    title: { en: 'Skipping the payment step', vi: 'Bỏ qua bước thanh toán' },
    situation: {
      en: 'A bug bounty hunter showed that the online store would ship an order if the browser jumped straight from the cart page to the order-confirmation URL, skipping payment. The release pipeline already runs SAST, an automated DAST scan and dependency checks, and all of them passed.',
      vi: 'Một bug bounty hunter chứng minh được là cửa hàng online vẫn giao hàng nếu trình duyệt nhảy thẳng từ trang giỏ hàng sang URL xác nhận đơn, bỏ qua bước thanh toán. Release pipeline đã chạy SAST, DAST scan tự động và kiểm tra dependency, tất cả đều pass.',
    },
    question: { en: 'Which testing approach would MOST likely have found this before release?', vi: 'Cách test nào có KHẢ NĂNG CAO NHẤT bắt được lỗi này trước khi release?' },
    options: [
      {
        id: 'A',
        text: { en: 'Fuzzing the checkout API with malformed input.', vi: 'Fuzz checkout API bằng input sai định dạng.' },
        why: {
          en: 'Fuzzing finds crashes and input-handling bugs. The attack used perfectly valid requests in an unexpected order.',
          vi: 'Fuzzing tìm crash và lỗi xử lý input. Còn cuộc tấn công này dùng toàn request hợp lệ, chỉ là gửi theo thứ tự không ai ngờ tới.',
        },
      },
      {
        id: 'B',
        text: { en: 'Misuse-case testing of the checkout workflow by a tester.', vi: 'Tester làm misuse-case testing cho luồng checkout.' },
        why: {
          en: 'Correct. Misuse or abuse cases ask "how could someone break this business process?" (skip steps, repeat steps, change prices) and are tested deliberately, usually by a person who understands the workflow.',
          vi: 'Đúng. Misuse case hay abuse case đặt câu hỏi “người ta có thể phá quy trình nghiệp vụ này bằng cách nào?” (bỏ bước, lặp bước, sửa giá) rồi test có chủ đích, thường do một người hiểu rõ workflow làm.',
        },
      },
      {
        id: 'C',
        text: { en: 'Increasing SAST rule coverage to the highest level.', vi: 'Nâng rule coverage của SAST lên mức cao nhất.' },
        why: {
          en: 'SAST looks for insecure code patterns. Missing a "was payment completed?" check is a design flaw with no pattern to match.',
          vi: 'SAST tìm pattern code không an toàn. Thiếu một bước check “đã thanh toán chưa?” là lỗi thiết kế, không có pattern nào để match.',
        },
      },
      {
        id: 'D',
        text: { en: 'Running the DAST scanner with authenticated sessions.', vi: 'Chạy DAST scanner với session đã xác thực.' },
        why: {
          en: 'Authenticated DAST finds more injection and configuration issues, but scanners do not understand that payment must precede shipping.',
          vi: 'DAST có xác thực tìm được nhiều lỗi injection và cấu hình hơn, nhưng scanner không hiểu rằng phải thanh toán xong rồi mới được giao hàng.',
        },
      },
    ],
    answer: 'B',
    explanation: {
      en: 'Automated tools are good at known vulnerability classes. Business logic flaws need someone to think like an abuser of the process. Misuse-case testing, threat modelling the workflow and manual testing find them; server-side state checks fix them.',
      vi: 'Tool tự động giỏi với các lớp lỗ hổng đã biết. Lỗi business logic thì cần người nghĩ như kẻ lạm dụng quy trình. Misuse-case testing, threat modeling cho workflow và test thủ công sẽ tìm ra chúng; còn fix thì bằng kiểm tra state ở phía server.',
    },
    takeaway: {
      en: 'Business logic flaw → misuse-case or manual testing. Scanners pass it.',
      vi: 'Lỗi business logic → misuse-case hoặc test thủ công. Scanner sẽ cho pass.',
    },
    concepts: ['misuse case testing', 'business logic', 'SAST', 'DAST'],
  },

  // ── Domain 7 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-ransomware-patient-safety',
    domainId: 'd7',
    alsoDomains: ['d1'],
    level: 'hard',
    title: { en: 'Ransomware next to the ICU', vi: 'Ransomware sát vách ICU' },
    situation: {
      en: 'Ransomware is spreading on a hospital network. One infected server manages the infusion pumps in the intensive care unit; it pushes dosage updates to the pumps. The incident response plan says to isolate infected servers immediately. Isolating this one will stop dosage updates to ICU patients.',
      vi: 'Ransomware đang lây trong mạng bệnh viện. Một server bị nhiễm đang quản lý các bơm tiêm truyền ở ICU, chuyên đẩy cập nhật liều thuốc xuống bơm. Incident response plan ghi rõ phải cô lập server nhiễm ngay. Mà cô lập server này thì bệnh nhân ICU sẽ không nhận được cập nhật liều nữa.',
    },
    question: { en: 'What should be done FIRST?', vi: 'Cần làm gì TRƯỚC TIÊN?' },
    options: [
      {
        id: 'A',
        text: { en: 'Isolate the server immediately, as the plan requires.', vi: 'Cô lập server ngay lập tức, đúng như plan yêu cầu.' },
        why: {
          en: 'Containment matters, and following the plan is normally right. But doing it before the clinical side is ready could put patients at risk.',
          vi: 'Containment quan trọng, và bình thường làm theo plan là đúng. Nhưng làm khi phía lâm sàng chưa sẵn sàng thì có thể đặt bệnh nhân vào nguy hiểm.',
        },
      },
      {
        id: 'B',
        text: { en: 'Leave the server running and monitor it closely.', vi: 'Để server tiếp tục chạy và theo dõi thật sát.' },
        why: {
          en: 'Leaving ransomware to spread risks more systems, including other clinical ones, and is not a plan.',
          vi: 'Để ransomware lây tiếp là đẩy thêm nhiều hệ thống vào rủi ro, kể cả các hệ thống lâm sàng khác. Mà đó cũng không phải là một kế hoạch.',
        },
      },
      {
        id: 'C',
        text: { en: 'Notify the hospital\'s regulators and patient-safety officer about the incident.', vi: 'Báo sự cố cho cơ quan quản lý và người phụ trách an toàn người bệnh.' },
        why: {
          en: 'Required, and the patient-safety officer should be involved early, but notifying people does not protect the patients connected to the pumps right now or stop the spread.',
          vi: 'Bắt buộc phải làm, và nên kéo người phụ trách an toàn người bệnh vào sớm, nhưng báo tin thì không bảo vệ được bệnh nhân đang nối với bơm ngay lúc này, cũng không chặn được lây lan.',
        },
      },
      {
        id: 'D',
        text: { en: 'Move the ICU pumps to manual clinical procedures, then isolate the server.', vi: 'Chuyển bơm ICU sang quy trình thủ công, rồi cô lập server.' },
        why: {
          en: 'Correct. Protect people first by activating the clinical downtime procedure, then contain. A compromised server could also push wrong dosages, so it must come off the network, just not before patients are safe.',
          vi: 'Đúng. Bảo vệ con người trước bằng cách kích hoạt quy trình downtime lâm sàng, rồi mới containment. Server đã bị compromise cũng có thể đẩy liều sai, nên vẫn phải ngắt khỏi mạng, chỉ là không làm trước khi bệnh nhân an toàn.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Human safety outranks every other priority, including containment and evidence. That does not mean "do not contain"; it means sequence the response so people are protected first, using the business continuity workaround, then proceed with the incident plan. Cross-domain questions like this test whether you apply the priority order under pressure.',
      vi: 'An toàn con người đứng trên mọi ưu tiên khác, kể cả containment và evidence. Như vậy không có nghĩa là “đừng contain”, mà là sắp thứ tự phản ứng sao cho con người được bảo vệ trước bằng phương án thay thế trong business continuity, rồi mới đi tiếp theo incident plan. Câu hỏi liên domain kiểu này kiểm tra xem bạn có giữ đúng thứ tự ưu tiên khi bị áp lực không.',
    },
    takeaway: {
      en: 'Safety first, then contain. Use the manual workaround to make containment safe.',
      vi: 'An toàn trước, contain sau. Dùng phương án thủ công để containment không gây hại.',
    },
    concepts: ['incident response', 'life safety', 'containment', 'BCP workaround'],
  },
  {
    id: 'hard-evidence-vs-restore',
    domainId: 'd7',
    level: 'hard',
    title: { en: 'The business wants the shop back now', vi: 'Kinh doanh muốn mở shop lại ngay' },
    situation: {
      en: 'Your e-commerce server was compromised and customer card data may have been stolen. The sales director wants it rebuilt and online within the hour. Legal says regulators and possibly law enforcement will be involved.',
      vi: 'Server e-commerce của bạn bị compromise và dữ liệu thẻ của khách hàng có thể đã bị đánh cắp. Giám đốc kinh doanh muốn dựng lại và đưa online trong vòng một giờ. Bên pháp chế nói sẽ có cơ quan quản lý, và có thể cả công an, vào cuộc.',
    },
    question: { en: 'What is the BEST course of action?', vi: 'Hướng xử lý TỐT NHẤT là gì?' },
    options: [
      {
        id: 'A',
        text: { en: 'Rebuild from the golden image immediately to minimise lost sales, and review the logs afterwards.', vi: 'Dựng lại ngay từ golden image cho đỡ mất doanh số, xem log sau cũng được.' },
        why: {
          en: 'Fast, but it destroys the evidence regulators and investigators will need, and you will not know how the attacker got in, so the rebuilt server may be compromised the same way.',
          vi: 'Nhanh thật, nhưng xóa sạch evidence mà cơ quan quản lý và bên điều tra sẽ cần. Bạn cũng không biết attacker vào bằng đường nào, nên server dựng lại có thể bị chiếm y như cũ.',
        },
      },
      {
        id: 'B',
        text: { en: 'Leave it untouched until law enforcement arrives.', vi: 'Giữ nguyên hiện trạng cho đến khi bên công an tới.' },
        why: {
          en: 'Protects evidence, but may leave a compromised system running, and the business cannot wait an unknown time for an outside agency.',
          vi: 'Giữ được evidence, nhưng có thể để một hệ thống đã bị chiếm tiếp tục chạy, mà doanh nghiệp thì không thể ngồi chờ một cơ quan bên ngoài trong khoảng thời gian không biết trước.',
        },
      },
      {
        id: 'C',
        text: { en: 'Isolate it, image memory and disk with chain of custody, then rebuild on clean infrastructure.', vi: 'Cô lập, image memory và disk kèm chain of custody, rồi dựng lại.' },
        why: {
          en: 'Correct. Forensic acquisition takes hours, not days, and preserves admissible evidence. The business gets service back on clean infrastructure, with the root cause found from the images.',
          vi: 'Đúng. Thu thập forensic mất vài giờ chứ không phải vài ngày, và giữ được evidence có giá trị pháp lý. Doanh nghiệp có lại dịch vụ trên hạ tầng sạch, còn root cause thì tìm từ các bản image.',
        },
      },
      {
        id: 'D',
        text: { en: 'Keep it online but monitored to learn what the attacker does next.', vi: 'Để online nhưng theo dõi, xem attacker làm gì tiếp theo.' },
        why: {
          en: 'Watching an attacker can be valid in some investigations, but with card data at risk you would be knowingly allowing further theft.',
          vi: 'Theo dõi attacker có thể hợp lý trong một số cuộc điều tra, nhưng khi dữ liệu thẻ đang bị đe dọa thì bạn đang cố tình để nó tiếp tục bị lấy cắp.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: 'When recovery and investigation conflict, the BEST answer usually satisfies both in the right order: contain, preserve evidence (volatile first), then recover on clean systems. Pure speed loses the evidence; pure caution loses the business. With card data, card-brand rules may also require a PCI Forensic Investigator, one more reason to preserve evidence.',
      vi: 'Khi khôi phục và điều tra xung đột nhau, đáp án TỐT NHẤT thường đáp ứng cả hai theo đúng thứ tự: contain, giữ evidence (volatile trước), rồi khôi phục trên hệ thống sạch. Chỉ lo nhanh thì mất evidence; chỉ lo cẩn thận thì mất việc kinh doanh. Với dữ liệu thẻ, quy định của các tổ chức thẻ có thể còn yêu cầu PCI Forensic Investigator, thêm một lý do để giữ evidence.',
    },
    takeaway: {
      en: 'Preserve evidence, then restore on clean infrastructure. Do both, in that order.',
      vi: 'Giữ evidence trước, restore trên hạ tầng sạch sau. Làm cả hai, đúng thứ tự.',
    },
    concepts: ['forensics', 'evidence preservation', 'recovery'],
  },

  // ── Domain 8 ──────────────────────────────────────────────────────────────
  {
    id: 'hard-idor-fix',
    domainId: 'd8',
    level: 'hard',
    title: { en: 'Changing the order number in the URL', vi: 'Sửa số đơn hàng trên URL' },
    situation: {
      en: 'A customer noticed that changing /api/orders/10452 to /api/orders/10453 in the mobile app\'s traffic returns another customer\'s order, with name and address. The API requires a valid login token.',
      vi: 'Một khách hàng phát hiện chỉ cần đổi /api/orders/10452 thành /api/orders/10453 trong traffic của mobile app là đọc được đơn hàng của khách khác, có cả tên và địa chỉ. API có yêu cầu login token hợp lệ.',
    },
    question: { en: 'Which fix BEST addresses the root cause?', vi: 'Cách fix nào xử lý root cause TỐT NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'Replace sequential order numbers with random UUIDs so IDs cannot be guessed.', vi: 'Đổi số đơn tuần tự sang UUID ngẫu nhiên để không đoán được ID.' },
        why: {
          en: 'Makes guessing harder, but anyone who obtains another order ID (from a shared link, a log, a support ticket) can still read it. This is obscurity, not access control.',
          vi: 'Khó đoán hơn thật, nhưng ai lấy được order ID của người khác (qua link chia sẻ, log, support ticket) vẫn đọc được. Đây là obscurity, không phải access control.',
        },
      },
      {
        id: 'B',
        text: { en: 'Add rate limiting to the orders endpoint.', vi: 'Thêm rate limiting cho endpoint orders.' },
        why: {
          en: 'Slows mass scraping but still allows any single unauthorised read.',
          vi: 'Làm chậm việc cào dữ liệu hàng loạt, nhưng từng lần đọc trái phép riêng lẻ thì vẫn lọt.',
        },
      },
      {
        id: 'C',
        text: { en: 'Limit the login token\'s scope to an orders:read permission.', vi: 'Giới hạn scope của login token chỉ còn quyền orders:read.' },
        why: {
          en: 'Scopes control which kinds of action a token may perform. Every customer legitimately needs orders:read, so the token would still be allowed to read order 10453.',
          vi: 'Scope quy định token được làm loại hành động nào. Khách hàng nào cũng chính đáng cần orders:read, nên token vẫn được phép đọc đơn 10453.',
        },
      },
      {
        id: 'D',
        text: { en: 'Check server-side, on every request, that the user owns the requested order.', vi: 'Mỗi request, server kiểm tra user có sở hữu đơn đó không.' },
        why: {
          en: 'Correct. This is broken object-level authorisation (IDOR). Authentication proves who the user is; the server must also check that this user may access this specific object.',
          vi: 'Đúng. Đây là lỗi broken object-level authorization (IDOR). Authentication chứng minh user là ai; server còn phải kiểm tra user này có được truy cập đúng object này không.',
        },
      },
    ],
    answer: 'D',
    explanation: {
      en: 'Authentication is not authorisation. Broken access control tops the OWASP Top 10, and this exact flaw is API1 in the OWASP API Security Top 10: Broken Object Level Authorization (BOLA, also called IDOR). UUIDs, rate limits and token scopes are useful layers, but the root-cause fix is a server-side check that this user may access this specific object, on every request.',
      vi: 'Authentication không phải authorization. Broken access control đứng đầu OWASP Top 10, và đúng lỗi này là API1 trong OWASP API Security Top 10: Broken Object Level Authorization (BOLA, còn gọi là IDOR). UUID, rate limit và token scope là những lớp có ích, nhưng fix tận gốc là check ở phía server rằng user này được truy cập object cụ thể này, trên mọi request.',
    },
    takeaway: {
      en: 'Logged in ≠ allowed. Check ownership server-side on every object.',
      vi: 'Đã login ≠ được phép. Check quyền sở hữu ở server cho từng object.',
    },
    concepts: ['IDOR', 'broken access control', 'OWASP Top 10'],
  },
  {
    id: 'hard-agile-security-requirements',
    domainId: 'd8',
    alsoDomains: ['d1'],
    level: 'hard',
    title: { en: 'Security in two-week sprints', vi: 'Security trong sprint hai tuần' },
    situation: {
      en: 'A product team works in two-week Scrum sprints and releases every month. Security findings keep arriving late, after features are built. The product owner asks where security requirements should live so they are actually built in.',
      vi: 'Một product team chạy Scrum với sprint hai tuần và release mỗi tháng. Finding security cứ đến muộn, lúc feature đã làm xong. Product owner hỏi nên để security requirement ở đâu để team thực sự build nó vào sản phẩm.',
    },
    question: { en: 'Where would security requirements be MOST effective?', vi: 'Đặt security requirement ở đâu thì HIỆU QUẢ NHẤT?' },
    options: [
      {
        id: 'A',
        text: { en: 'In a security requirements document written at the start of the project.', vi: 'Trong một tài liệu security requirement viết từ đầu dự án.' },
        why: {
          en: 'Early is good, but a separate document drifts from a backlog that changes every sprint, and developers rarely reread it.',
          vi: 'Làm sớm là tốt, nhưng một tài liệu riêng sẽ lệch dần khỏi backlog vốn thay đổi mỗi sprint, và developer hiếm khi mở lại đọc.',
        },
      },
      {
        id: 'B',
        text: { en: 'In a dedicated security-hardening sprint before each release.', vi: 'Trong một sprint hardening security riêng ngay trước mỗi lần release.' },
        why: {
          en: 'Better than nothing, but it batches security at the end, which is exactly the "findings arrive late" problem.',
          vi: 'Có còn hơn không, nhưng nó dồn security về cuối, đúng y vấn đề “finding đến muộn”.',
        },
      },
      {
        id: 'C',
        text: { en: 'In each user story\'s acceptance criteria and the team\'s definition of done.', vi: 'Trong acceptance criteria của từng story và definition of done.' },
        why: {
          en: 'Correct. In agile, work is built and accepted per story. Putting security criteria there makes it part of building and accepting every feature.',
          vi: 'Đúng. Trong agile, team build và nghiệm thu theo từng story. Đưa tiêu chí security vào đó thì security thành một phần của việc build và nghiệm thu mọi feature.',
        },
      },
      {
        id: 'D',
        text: { en: 'In the scope of a penetration test before every release.', vi: 'Trong scope của một đợt pentest trước mỗi lần release.' },
        why: {
          en: 'Pen tests verify; they do not build security in, and they still find problems after the code is written.',
          vi: 'Pentest để kiểm chứng chứ không build security vào sản phẩm, và vẫn tìm ra lỗi sau khi code đã viết xong.',
        },
      },
    ],
    answer: 'C',
    explanation: {
      en: '"Security from the start" means something different per methodology. In waterfall, the requirements phase. In agile, the unit of work is the story, so security belongs in stories (including abuser stories), acceptance criteria and the definition of done, with testing automated in the pipeline.',
      vi: '“Security ngay từ đầu” mang nghĩa khác nhau tùy phương pháp. Với waterfall, đó là pha requirements. Với agile, đơn vị công việc là story, nên security nằm trong story (kể cả abuser story), acceptance criteria và definition of done, cộng với test tự động trong pipeline.',
    },
    takeaway: {
      en: 'Agile: put security in the story and the definition of done, not in a separate phase.',
      vi: 'Agile: nhét security vào story và definition of done, đừng tách thành một pha riêng.',
    },
    concepts: ['agile', 'definition of done', 'security requirements'],
  },
];
