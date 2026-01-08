import type { Category } from '@prisma/client';

interface TagProps {
  category: Category;
}

const CATEGORY_STYLES: Record<Category, string> = {
  PRODUCT_UPDATE: 'tag-product',
  MONETIZATION_CHANGE: 'tag-monetization',
  SAFETY_YOUTH_RISK: 'tag-safety',
  NSFW_CONTENT_POLICY: 'tag-nsfw',
  CULTURAL_TREND: 'tag-cultural',
  REGULATORY_LEGAL: 'tag-regulatory',
  BUSINESS_FUNDING: 'tag-business',
};

const CATEGORY_LABELS: Record<Category, string> = {
  PRODUCT_UPDATE: 'Product',
  MONETIZATION_CHANGE: 'Pricing',
  SAFETY_YOUTH_RISK: 'Safety',
  NSFW_CONTENT_POLICY: 'NSFW Policy',
  CULTURAL_TREND: 'Culture',
  REGULATORY_LEGAL: 'Regulatory',
  BUSINESS_FUNDING: 'Business',
};

export function Tag({ category }: TagProps) {
  return (
    <span className={`tag ${CATEGORY_STYLES[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function TagList({ categories }: { categories: Category[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {categories.map((category) => (
        <Tag key={category} category={category} />
      ))}
    </div>
  );
}
