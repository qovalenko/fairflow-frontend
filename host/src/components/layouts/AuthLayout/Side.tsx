import type { CommonProps } from '@/@types/common'

type SideProps = CommonProps

const Side = ({ children }: SideProps) => {
    return (
        <div className="dark flex h-full min-h-0 max-h-full p-0 bg-slate-950 text-slate-100 rounded-none overflow-hidden w-full">
            <div className="flex flex-col justify-center items-center flex-1">
                <div className="w-full xl:max-w-[450px] px-8 max-w-[380px]">
                    {children}
                </div>
            </div>
            <div className="py-0 px-0 lg:flex flex-col flex-1 justify-between hidden overflow-hidden items-end relative xl:max-w-[520px] 2xl:max-w-[720px]">
                <div className="absolute inset-0 rounded-none overflow-hidden">
                    <img
                        src="/img/others/auth-side-bg.png"
                        className="h-full w-full object-contain object-center"
                    />
                </div>
            </div>
        </div>
    )
}

export default Side

