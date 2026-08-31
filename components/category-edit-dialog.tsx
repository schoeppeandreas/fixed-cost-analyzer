'use client'

import type { Category } from '@/lib/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Popup zum Korrigieren der Kategorie einer Serie. Wird sowohl in der
 * Serientabelle als auch in der Lebensmittelprognose verwendet, damit eine
 * Serie von überall dort aus, wo sie auftaucht, umkategorisiert werden kann.
 */
export function CategoryEditDialog({
  item,
  categories,
  open,
  onOpenChange,
  onCategoryChange,
}: {
  item: { key: string; label: string; categoryId: string } | null
  categories: Category[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCategoryChange: (seriesKey: string, categoryId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Serie bearbeiten</DialogTitle>
          <DialogDescription>
            Kategorie für diese Serie ändern. Die Änderung gilt für alle Buchungen dieser Serie.
          </DialogDescription>
        </DialogHeader>
        {item ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{item.label}</span>
            <Select
              value={item.categoryId}
              onValueChange={(value) => {
                onCategoryChange(item.key, String(value))
                onOpenChange(false)
              }}
            >
              <SelectTrigger aria-label="Kategorie auswählen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
