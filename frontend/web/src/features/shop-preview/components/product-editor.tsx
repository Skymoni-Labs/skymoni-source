/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { InstructionEditor } from '@/features/benefits/components/instruction-editor'

import type { ShopProduct } from '../types'
import { ProductDescription } from './product-description'
import { ProductCoverEditor, ProductImagesEditor } from './product-images'

const price = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .refine((value) => Number(value) > 0 && Number(value) <= 1_000_000)
const schema = z.object({
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(200),
  category: z.enum(['account', 'license', 'resource', 'custom']),
  categoryLabel: z.string().trim().min(1).max(40),
  price,
  delivery: z.enum(['instant', 'manual']),
  validityDays: z.number().int().min(0).max(3650),
  quotaGiB: z.number().int().min(0).max(100000),
  featured: z.boolean(),
  cardSize: z.enum(['normal', 'large']),
  sortOrder: z.number().int().min(0).max(1_000_000),
  stockMode: z.enum(['individual', 'shared']),
  tags: z.string().max(200),
  coverUrl: z
    .string()
    .refine(
      (value) =>
        !value ||
        (value.startsWith('/') && !value.startsWith('//')) ||
        (value.startsWith('https://') && z.url().safeParse(value).success)
    ),
  content: z.string().max(16000),
  contentFormat: z.enum(['markdown', 'html', 'text']),
  imagesEnabled: z.boolean(),
  imageLayout: z.enum(['portrait', 'landscape']),
  images: z.array(z.string().min(1)).max(12),
  instructions: z.string().max(12000),
  format: z.enum(['markdown', 'html']),
  defaultPackageName: z.string().trim().min(1).max(60),
  packages: z
    .array(
      z.object({
        packageId: z.string(),
        name: z.string().trim().min(1).max(60),
        price,
        validityDays: z.number().int().min(0).max(3650),
        quotaGiB: z.number().int().min(0).max(100000),
        delivery: z.enum(['instant', 'manual']),
      })
    )
    .max(20),
  fields: z
    .array(
      z.object({
        fieldId: z.string(),
        label: z.string().trim().min(1).max(60),
        kind: z.enum(['text', 'secret', 'link']),
        value: z.string().max(4096),
      })
    )
    .min(1)
    .max(20),
  attributes: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.string().trim().min(1).max(500),
      })
    )
    .max(20),
})

export function ProductEditor(props: {
  live?: boolean
  product: ShopProduct
  initialSection?: 'basic' | 'content'
  onClose: () => void
  onSave: (product: ShopProduct) => void | Promise<void>
  onUploadImage?: (file: File, signal: AbortSignal) => Promise<string>
}) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(
      props.live
        ? schema.superRefine((value, ctx) => {
            if (!props.product.generatedSales) return
            const plans = [
              {
                quotaGiB: value.quotaGiB,
                validityDays: value.validityDays,
                delivery: value.delivery,
              },
              ...value.packages,
            ]
            plans.forEach((plan, index) => {
              for (const field of ['quotaGiB', 'validityDays'] as const) {
                if (plan[field] < 1)
                  ctx.addIssue({
                    code: 'custom',
                    message: '流量与有效天数必须大于 0',
                    path:
                      index === 0 ? [field] : ['packages', index - 1, field],
                  })
              }
              if (plan.delivery !== 'instant')
                ctx.addIssue({
                  code: 'custom',
                  message: '代理套餐使用自动交付',
                  path:
                    index === 0
                      ? ['delivery']
                      : ['packages', index - 1, 'delivery'],
                })
            })
          })
        : schema.extend({ coverUrl: z.string().max(3_000_000) })
    ),
    defaultValues: {
      name: props.product.benefit.name,
      summary: props.product.benefit.summary,
      category: props.product.benefit.category,
      categoryLabel: props.product.categoryLabel,
      price: String(props.product.priceCents / 100),
      delivery: props.product.delivery,
      validityDays: props.product.benefit.validityDays,
      quotaGiB: props.product.quotaGiB || 0,
      featured: props.product.featured,
      cardSize: props.product.cardSize || 'normal',
      sortOrder: props.product.sortOrder || 0,
      stockMode: props.product.benefit.stockMode,
      tags: props.product.tags || '',
      coverUrl: props.product.coverUrl || '',
      content: props.product.content || '',
      contentFormat: props.product.contentFormat || 'markdown',
      imagesEnabled: props.product.imagesEnabled || false,
      imageLayout: props.product.imageLayout || 'landscape',
      images: props.product.images || [],
      instructions: props.product.benefit.instructions,
      format: props.product.benefit.format,
      defaultPackageName:
        props.product.defaultPackageName || t('Standard package'),
      packages: (props.product.packages || []).map((p) => ({
        packageId: p.id,
        name: p.name,
        price: String(p.priceCents / 100),
        validityDays: p.validityDays,
        quotaGiB: p.quotaGiB || 0,
        delivery: p.delivery,
      })),
      fields: props.product.benefit.fields.map((f) => ({
        fieldId: f.id,
        label: f.label,
        kind: f.kind,
        value: f.value,
      })),
      attributes: props.product.attributes || [],
    },
  })
  const packs = useFieldArray({ control: form.control, name: 'packages' })
  const fields = useFieldArray({ control: form.control, name: 'fields' })
  const attributes = useFieldArray({
    control: form.control,
    name: 'attributes',
  })
  const [
    content,
    mode,
    featured,
    stockMode,
    imagesEnabled,
    images,
    coverUrl,
    imageLayout,
  ] = useWatch({
    control: form.control,
    name: [
      'content',
      'contentFormat',
      'featured',
      'stockMode',
      'imagesEnabled',
      'images',
      'coverUrl',
      'imageLayout',
    ],
  })
  const [instructions, instructionFormat] = useWatch({
    control: form.control,
    name: ['instructions', 'format'],
  })
  return (
    <Dialog
      open
      title={
        props.initialSection === 'content'
          ? t('Edit product details')
          : t('Edit product')
      }
      description={t(
        'Configure the product, its packages and delivery content.'
      )}
      contentClassName='sm:max-w-4xl'
      contentHeight='min(65dvh, 640px)'
      onOpenChange={(open) => {
        if (!open && !uploading) props.onClose()
      }}
      footer={
        <>
          <Button
            variant='outline'
            disabled={uploading}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            form='shop-product-editor'
            type='submit'
            disabled={form.formState.isSubmitting || uploading}
          >
            {t('Save product')}
          </Button>
        </>
      }
    >
      <form
        id='shop-product-editor'
        className='space-y-4'
        onSubmit={form.handleSubmit((v) => {
          if (uploading) return
          return props.onSave({
            ...props.product,
            priceCents: Math.round(Number(v.price) * 100),
            quotaGiB: props.product.generatedSales ? v.quotaGiB : undefined,
            delivery: v.delivery,
            featured: v.featured,
            cardSize: v.cardSize,
            sortOrder: v.sortOrder,
            categoryLabel: v.categoryLabel,
            tags: v.tags,
            coverUrl: v.coverUrl,
            content: v.content,
            contentFormat: v.contentFormat,
            imagesEnabled: v.imagesEnabled,
            imageLayout: v.imageLayout,
            images: v.images,
            defaultPackageName: v.defaultPackageName,
            attributes: v.attributes,
            packages: v.packages.map((p) => ({
              id: p.packageId,
              name: p.name,
              priceCents: Math.round(Number(p.price) * 100),
              quotaGiB: props.product.generatedSales ? p.quotaGiB : undefined,
              validityDays: p.validityDays,
              delivery: p.delivery,
            })),
            benefit: {
              ...props.product.benefit,
              name: v.name,
              summary: v.summary,
              category: v.category,
              validityDays: v.validityDays,
              format: v.format,
              instructions: v.instructions,
              stockMode: v.stockMode,
              fields: v.fields.map((f) => ({
                id: f.fieldId,
                label: f.label,
                kind: f.kind,
                value: f.value,
              })),
            },
          })
        })}
      >
        <Tabs defaultValue={props.initialSection || 'basic'}>
          <TabsList
            className='mb-4 w-full'
            aria-label={t('Product editor sections')}
          >
            <TabsTrigger value='basic'>{t('Basic information')}</TabsTrigger>
            <TabsTrigger value='content'>{t('Display content')}</TabsTrigger>
            <TabsTrigger value='packages'>
              {t('Packages and prices')}
            </TabsTrigger>
            <TabsTrigger value='delivery'>{t('Delivery content')}</TabsTrigger>
          </TabsList>
          <TabsContent value='basic' keepMounted className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='shop-name'>{t('Product name')}</Label>
              <Input id='shop-name' {...form.register('name')} />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='shop-summary'>{t('Short description')}</Label>
              <Textarea
                id='shop-summary'
                readOnly={props.product.generatedSales}
                {...form.register('summary')}
              />
              {props.product.generatedSales && (
                <p className='text-muted-foreground text-xs'>
                  套餐简介随流量、售价和天数自动生成。
                </p>
              )}
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='shop-type'>{t('Product type')}</Label>
                <NativeSelect
                  id='shop-type'
                  {...form.register('category')}
                  className='w-full'
                >
                  <option value='account'>{t('Account')}</option>
                  <option value='license'>{t('Activation code')}</option>
                  <option value='resource'>{t('Digital resource')}</option>
                  <option value='custom'>
                    {t('Service or custom product')}
                  </option>
                </NativeSelect>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='shop-category'>
                  {t('Custom category name')}
                </Label>
                <Input
                  id='shop-category'
                  {...form.register('categoryLabel')}
                  placeholder={t(
                    'For example: music accounts or design resources'
                  )}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='shop-tags'>{t('Product tags')}</Label>
                <Input
                  id='shop-tags'
                  {...form.register('tags')}
                  placeholder={t('Separate tags with commas')}
                />
              </div>
            </div>
            <ProductCoverEditor
              coverUrl={coverUrl}
              images={images}
              disabled={uploading}
              onChange={(url) =>
                form.setValue('coverUrl', url, { shouldDirty: true })
              }
              onImagesChange={(value) =>
                form.setValue('images', value, { shouldDirty: true })
              }
              onBusyChange={setUploading}
              onUpload={props.onUploadImage}
            />
            <Label className='flex items-center gap-2'>
              <Checkbox
                checked={featured}
                onCheckedChange={(value) =>
                  form.setValue('featured', Boolean(value))
                }
              />
              {t('Featured product')}
            </Label>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='shop-card-size'>{t('Card size')}</Label>
                <NativeSelect
                  id='shop-card-size'
                  className='w-full'
                  {...form.register('cardSize')}
                >
                  <option value='normal'>{t('Normal card')}</option>
                  <option value='large'>{t('Large card')}</option>
                </NativeSelect>
              </div>
              <div className='space-y-2'>
                <Label htmlFor='shop-sort-order'>{t('Display order')}</Label>
                <Input
                  id='shop-sort-order'
                  type='number'
                  min={0}
                  max={1000000}
                  {...form.register('sortOrder', { valueAsNumber: true })}
                />
                <p className='text-muted-foreground text-xs'>
                  {t('Lower numbers appear first.')}
                </p>
              </div>
            </div>
            <p className='text-muted-foreground text-xs leading-5'>
              {t(
                'Categories appear automatically in the store. An empty cover uses the built-in artwork.'
              )}
            </p>
          </TabsContent>
          <TabsContent value='content' keepMounted className='space-y-4'>
            <ProductImagesEditor
              enabled={imagesEnabled}
              name={props.product.benefit.name}
              imageLayout={imageLayout}
              onLayoutChange={(value) =>
                form.setValue('imageLayout', value, { shouldDirty: true })
              }
              images={images}
              coverUrl={coverUrl}
              disabled={uploading}
              onCoverChange={(url) =>
                form.setValue('coverUrl', url, { shouldDirty: true })
              }
              onEnabledChange={(value) =>
                form.setValue('imagesEnabled', value, { shouldDirty: true })
              }
              onChange={(value) => {
                form.setValue('images', value, { shouldDirty: true })
                if (images.includes(coverUrl) && !value.includes(coverUrl)) {
                  form.setValue('coverUrl', '', { shouldDirty: true })
                }
              }}
              onBusyChange={setUploading}
              onUpload={props.onUploadImage}
            />
            <div className='grid gap-4 sm:grid-cols-[1fr_1fr]'>
              <div className='space-y-3'>
                <Label htmlFor='shop-content-format'>
                  {t('Content format')}
                </Label>
                <NativeSelect
                  id='shop-content-format'
                  {...form.register('contentFormat')}
                  className='w-full'
                >
                  <option value='markdown'>Markdown</option>
                  <option value='html'>HTML</option>
                  <option value='text'>{t('Plain text')}</option>
                </NativeSelect>
                <Label htmlFor='shop-content'>
                  {t('Public product details')}
                </Label>
                <Textarea
                  id='shop-content'
                  rows={12}
                  {...form.register('content')}
                  className='font-mono text-xs'
                />
                <p className='text-muted-foreground text-xs leading-5'>
                  {t(
                    'Describe features, usage and package differences. Markdown and HTML support headings, images, links and tables. Add custom attributes below.'
                  )}
                </p>
              </div>
              <section className='min-w-0 rounded-xl border p-4'>
                <h3 className='text-muted-foreground mb-3 text-xs'>
                  {t('Live preview')}
                </h3>
                <ProductDescription content={content} mode={mode} />
              </section>
            </div>
            <div className='flex items-center justify-between'>
              <Label>{t('Custom product attributes')}</Label>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() => attributes.append({ label: '', value: '' })}
              >
                <Plus />
                {t('Add attribute')}
              </Button>
            </div>
            {attributes.fields.map((field, i) => (
              <div key={field.id} className='flex gap-2'>
                <Input
                  aria-label={t('Attribute name')}
                  placeholder={t('Attribute name')}
                  {...form.register(`attributes.${i}.label`)}
                />
                <Input
                  aria-label={t('Attribute value')}
                  placeholder={t('Attribute value')}
                  readOnly={
                    props.product.generatedSales &&
                    ['使用期限', '套餐价格（站内额度）'].includes(field.label)
                  }
                  {...form.register(`attributes.${i}.value`)}
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('Remove attribute')}
                  onClick={() => attributes.remove(i)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <p className='text-muted-foreground text-xs'>
              {t(
                'Public content is visible before payment. Keep account credentials in inventory, not in this description. HTML scripts are removed.'
              )}
            </p>
          </TabsContent>
          <TabsContent value='packages' keepMounted className='space-y-4'>
            {props.product.generatedSales && (
              <div className='rounded-xl border border-sky-500/25 bg-sky-500/5 p-4 text-sm leading-6'>
                在这里配置套餐，保存后自动同步商城、订阅交付、仓库说明和
                3X-UI。已购订单保留购买时的价格、流量和期限。
              </div>
            )}
            <section className='space-y-4 rounded-xl border p-4'>
              <h3 className='text-sm font-semibold'>{t('Default package')}</h3>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='shop-pack-name'>{t('Package name')}</Label>
                  <Input
                    id='shop-pack-name'
                    {...form.register('defaultPackageName')}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='shop-price'>
                    {t('Price in site credit')}
                  </Label>
                  <Input
                    id='shop-price'
                    inputMode='decimal'
                    {...form.register('price')}
                    aria-invalid={Boolean(form.formState.errors.price)}
                  />
                </div>
                {props.product.generatedSales && (
                  <div className='space-y-2'>
                    <Label htmlFor='shop-quota'>套餐流量（GiB）</Label>
                    <Input
                      id='shop-quota'
                      type='number'
                      min={1}
                      max={100000}
                      {...form.register('quotaGiB', { valueAsNumber: true })}
                    />
                    {form.formState.errors.quotaGiB && (
                      <p className='text-destructive text-xs'>
                        {form.formState.errors.quotaGiB.message}
                      </p>
                    )}
                  </div>
                )}
                <div className='space-y-2'>
                  <Label htmlFor='shop-validity'>{t('Validity in days')}</Label>
                  <Input
                    id='shop-validity'
                    type='number'
                    min={props.product.generatedSales ? 1 : 0}
                    max='3650'
                    {...form.register('validityDays', { valueAsNumber: true })}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='shop-delivery'>{t('Delivery mode')}</Label>
                  <NativeSelect
                    id='shop-delivery'
                    disabled={props.product.generatedSales}
                    {...form.register('delivery')}
                    className='w-full'
                  >
                    <option value='instant'>{t('Instant delivery')}</option>
                    <option value='manual'>{t('Manual delivery')}</option>
                  </NativeSelect>
                </div>
              </div>
            </section>
            {packs.fields.map((pack, i) => (
              <section
                key={pack.id}
                className='space-y-3 rounded-xl border p-4'
              >
                <div className='flex items-center justify-between'>
                  <h3 className='text-sm font-medium'>
                    {t('Additional package')}
                  </h3>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    aria-label={t('Remove package')}
                    onClick={() => packs.remove(i)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <div className='space-y-2'>
                    <Label htmlFor={`pack-name-${i}`}>
                      {t('Package name')}
                    </Label>
                    <Input
                      id={`pack-name-${i}`}
                      {...form.register(`packages.${i}.name`)}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor={`pack-price-${i}`}>
                      {t('Price in site credit')}
                    </Label>
                    <Input
                      id={`pack-price-${i}`}
                      inputMode='decimal'
                      {...form.register(`packages.${i}.price`)}
                    />
                  </div>
                  {props.product.generatedSales && (
                    <div className='space-y-2'>
                      <Label htmlFor={`pack-quota-${i}`}>套餐流量（GiB）</Label>
                      <Input
                        id={`pack-quota-${i}`}
                        type='number'
                        min={1}
                        max={100000}
                        {...form.register(`packages.${i}.quotaGiB`, {
                          valueAsNumber: true,
                        })}
                      />
                      {form.formState.errors.packages?.[i]?.quotaGiB && (
                        <p className='text-destructive text-xs'>
                          {form.formState.errors.packages[i]?.quotaGiB?.message}
                        </p>
                      )}
                    </div>
                  )}
                  <div className='space-y-2'>
                    <Label htmlFor={`pack-days-${i}`}>
                      {t('Validity in days')}
                    </Label>
                    <Input
                      id={`pack-days-${i}`}
                      type='number'
                      min={props.product.generatedSales ? 1 : 0}
                      max={3650}
                      {...form.register(`packages.${i}.validityDays`, {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label htmlFor={`pack-delivery-${i}`}>
                      {t('Delivery mode')}
                    </Label>
                    <NativeSelect
                      id={`pack-delivery-${i}`}
                      disabled={props.product.generatedSales}
                      className='w-full'
                      {...form.register(`packages.${i}.delivery`)}
                    >
                      <option value='instant'>{t('Instant delivery')}</option>
                      <option value='manual'>{t('Manual delivery')}</option>
                    </NativeSelect>
                  </div>
                </div>
              </section>
            ))}
            <Button
              type='button'
              variant='outline'
              onClick={() =>
                packs.append({
                  packageId: crypto.randomUUID(),
                  name: '',
                  price: '',
                  validityDays: 100,
                  quotaGiB: props.product.generatedSales ? 100 : 0,
                  delivery: 'instant',
                })
              }
            >
              <Plus />
              {t('Add package')}
            </Button>
            <p className='text-muted-foreground text-xs leading-5'>
              {t(
                props.product.generatedSales
                  ? '新套餐保存后可售数量为 0，请在可售数量中设置。移除套餐不影响已经交付的订阅。'
                  : 'Each package has its own price, delivery and stock. Zero validity means no expiry. Add inventory after saving.'
              )}
            </p>
          </TabsContent>
          <TabsContent value='delivery' keepMounted className='space-y-4'>
            <div className='space-y-2'>
              <Label htmlFor='shop-stock-mode'>{t('Inventory mode')}</Label>
              <NativeSelect
                id='shop-stock-mode'
                className='w-full'
                {...form.register('stockMode')}
              >
                <option value='individual'>{t('Independent inventory')}</option>
                <option value='shared'>{t('Shared content')}</option>
              </NativeSelect>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Independent accounts are allocated once. Shared content delivers the configured fields to each recipient.'
                )}
              </p>
            </div>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Label>{t('Delivery field template')}</Label>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() =>
                  fields.append({
                    fieldId: crypto.randomUUID(),
                    label: '',
                    kind: 'text',
                    value: '',
                  })
                }
              >
                <Plus />
                {t('Add field')}
              </Button>
            </div>
            {fields.fields.map((field, i) => (
              <div key={field.id} className='flex gap-2'>
                <Input
                  aria-label={t('Field label')}
                  {...form.register(`fields.${i}.label`)}
                />
                <NativeSelect
                  aria-label={t('Field type')}
                  {...form.register(`fields.${i}.kind`)}
                  className='w-36 shrink-0'
                >
                  <option value='text'>{t('Text')}</option>
                  <option value='secret'>{t('Masked secret')}</option>
                  <option value='link'>{t('Website or download link')}</option>
                </NativeSelect>
                {stockMode === 'shared' && (
                  <Input
                    aria-label={t('Shared delivery value')}
                    type={
                      form.getValues(`fields.${i}.kind`) === 'secret'
                        ? 'password'
                        : 'text'
                    }
                    {...form.register(`fields.${i}.value`)}
                    placeholder={t('Delivered to every recipient')}
                  />
                )}
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('Remove field')}
                  onClick={() => fields.remove(i)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <p className='text-muted-foreground text-xs leading-5'>
              {t(
                props.live
                  ? 'Configure delivery fields here. Import real account details under Inventory and codes after saving.'
                  : 'Define labels and field types here. Specific accounts, passwords, codes or links belong to each inventory item; this preview only generates fake inventory.'
              )}
            </p>
            <div className='space-y-2'>
              <Label htmlFor='shop-instructions-format'>
                {t('Delivery instructions format')}
              </Label>
              {props.product.generatedSales && (
                <p className='text-muted-foreground text-xs'>
                  套餐表会根据配置自动更新，其他使用说明可以自行编辑。仓库显示每笔订单购买时的套餐权益。
                </p>
              )}
              <NativeSelect
                id='shop-instructions-format'
                className='w-full'
                disabled={uploading || form.formState.isSubmitting}
                {...form.register('format')}
              >
                <option value='markdown'>Markdown</option>
                <option value='html'>HTML</option>
              </NativeSelect>
            </div>
            <InstructionEditor
              id='shop-instructions'
              label={t('Instructions after purchase')}
              value={instructions}
              format={instructionFormat}
              disabled={uploading || form.formState.isSubmitting}
              onBusyChange={setUploading}
              onUpload={props.onUploadImage}
              onChange={(value) =>
                form.setValue('instructions', value, { shouldDirty: true })
              }
            />
          </TabsContent>
        </Tabs>
        {Object.keys(form.formState.errors).length > 0 && (
          <p role='alert' className='text-xs text-red-600'>
            {t(
              'Check required names, positive prices, valid cover URL and delivery fields in all sections.'
            )}
          </p>
        )}
        <p className='text-muted-foreground text-xs'>
          {t(
            'Existing orders keep the price and terms from the time of purchase.'
          )}
        </p>
      </form>
    </Dialog>
  )
}
