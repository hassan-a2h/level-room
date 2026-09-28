import Dialog from './Dialog.jsx'

export default function Sheet({ side = 'right', ...props }) {
  return <Dialog {...props} className={`ui-sheet ui-sheet--${side} ${props.className ?? ''}`.trim()} />
}
