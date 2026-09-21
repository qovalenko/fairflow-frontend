import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import OrdersModule from './OrdersModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Orders"
            modulePath="/orders"
            ModuleComponent={OrdersModule}
        />
    </React.StrictMode>,
)
