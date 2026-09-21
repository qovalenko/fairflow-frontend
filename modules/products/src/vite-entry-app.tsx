import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneModuleApp from '@/components/template/StandaloneModuleApp'
import ProductsModule from './ProductsModule'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <StandaloneModuleApp
            moduleTitle="Products"
            modulePath="/products"
            ModuleComponent={ProductsModule}
        />
    </React.StrictMode>,
)
