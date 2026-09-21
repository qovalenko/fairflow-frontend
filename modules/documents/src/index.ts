// OQ-UX-DOCUMENTS-16: внешний/standalone-импорт должен резолвить роутер видов,
// а не лист — иначе теряются маршруты detail/templates/form.
export { default } from './DocumentsModule'
export { default as DocumentsTab } from '@/components/shared/documents/DocumentsTab'
export { default as DocumentsSettingsTab } from './DocumentsSettingsTab'
