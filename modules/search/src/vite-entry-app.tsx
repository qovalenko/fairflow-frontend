import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import SearchModule from './SearchModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Search"
            modulePath="/search"
            ModuleComponent={SearchModule}
        />
    </React.StrictMode>,
)
