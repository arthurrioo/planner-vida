import type { CategoryRecord } from "@/domain/categories";
import { getEnumLabel, type CategoryType } from "@/domain/shared";

type CategorySelectorProps = {
  categories: readonly CategoryRecord[];
  categoryName?: string;
  disabled?: boolean;
  includeEmpty?: boolean;
  label?: string;
  selectedId?: string | null;
  type?: CategoryType;
};

export function CategorySelector({
  categories,
  categoryName = "categoryId",
  disabled,
  includeEmpty = true,
  label = "Categoria",
  selectedId,
  type,
}: CategorySelectorProps) {
  const filtered = type
    ? categories.filter((category) => category.type === type)
    : categories;
  const roots = filtered.filter((category) => category.parentId === null);
  const children = filtered.filter((category) => category.parentId !== null);

  return (
    <label className="grid gap-2 text-sm font-medium">
      <span>{label}</span>
      <select
        className="border-border bg-background text-foreground focus-visible:ring-ring h-10 rounded-md border px-3 text-base outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
        defaultValue={selectedId ?? ""}
        disabled={disabled}
        name={categoryName}
      >
        {includeEmpty ? <option value="">Sem categoria</option> : null}
        {roots.map((root) => (
          <CategoryOptionGroup
            key={root.id}
            childrenCategories={children.filter(
              (category) => category.parentId === root.id,
            )}
            root={root}
          />
        ))}
      </select>
    </label>
  );
}

function CategoryOptionGroup({
  childrenCategories,
  root,
}: {
  childrenCategories: readonly CategoryRecord[];
  root: CategoryRecord;
}) {
  if (childrenCategories.length === 0) {
    return (
      <option value={root.id}>
        {root.name} - {getEnumLabel("category_type", root.type)}
      </option>
    );
  }

  return (
    <optgroup
      label={`${root.name} - ${getEnumLabel("category_type", root.type)}`}
    >
      <option value={root.id}>{root.name}</option>
      {childrenCategories.map((category) => (
        <option key={category.id} value={category.id}>
          {category.name}
        </option>
      ))}
    </optgroup>
  );
}
