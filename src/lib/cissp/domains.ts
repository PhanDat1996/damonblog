// CISSP domains and weights from the ISC2 exam outline effective 15 April 2024.

export type Lang = 'en' | 'vi';
export type Bi = { en: string; vi: string };

export interface Domain {
  id: DomainId;
  number: number;
  name: Bi;
  weight: number;
}

export type DomainId = 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'd8';

export const OUTLINE_META = {
  outline: 'CISSP Certification Exam Outline, effective April 15, 2024',
  source: 'https://www.isc2.org/certifications/cissp/cissp-certification-exam-outline',
};

export const DOMAINS: Domain[] = [
  { id: 'd1', number: 1, weight: 16, name: { en: 'Security and Risk Management', vi: 'Quản lý bảo mật và rủi ro' } },
  { id: 'd2', number: 2, weight: 10, name: { en: 'Asset Security', vi: 'Bảo mật tài sản' } },
  { id: 'd3', number: 3, weight: 13, name: { en: 'Security Architecture and Engineering', vi: 'Kiến trúc và kỹ thuật bảo mật' } },
  { id: 'd4', number: 4, weight: 13, name: { en: 'Communication and Network Security', vi: 'Bảo mật truyền thông và mạng' } },
  { id: 'd5', number: 5, weight: 13, name: { en: 'Identity and Access Management (IAM)', vi: 'Quản lý định danh và truy cập (IAM)' } },
  { id: 'd6', number: 6, weight: 12, name: { en: 'Security Assessment and Testing', vi: 'Đánh giá và kiểm thử bảo mật' } },
  { id: 'd7', number: 7, weight: 13, name: { en: 'Security Operations', vi: 'Vận hành bảo mật' } },
  { id: 'd8', number: 8, weight: 10, name: { en: 'Software Development Security', vi: 'Bảo mật phát triển phần mềm' } },
];

export function getDomain(id: DomainId): Domain {
  return DOMAINS.find((d) => d.id === id)!;
}
