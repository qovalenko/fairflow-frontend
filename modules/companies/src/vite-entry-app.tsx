// TODO-363: standalone-оболочка и дизайн-система живут в host/src и приезжают
// сюда через алиас '@' (см. ../vite.config.ts). Вынос в @fairflow/shared-ui —
// кросс-модульная задача уровня host+shared-ui, отдельным репозиторием.
import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import CompaniesModule from './CompaniesModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Companies"
            modulePath="/companies"
            ModuleComponent={CompaniesModule}
        />
    </React.StrictMode>,
)
