import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import DocumentsModule from './DocumentsModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Documents"
            modulePath="/documents"
            ModuleComponent={DocumentsModule}
        />
    </React.StrictMode>,
)
