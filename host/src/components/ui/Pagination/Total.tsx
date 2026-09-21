const Total = (props: { total: number }) => {
    const { total } = props
    return (
        <div className="pagination-total">
            Всего: <span>{total}</span>
        </div>
    )
}

export default Total
