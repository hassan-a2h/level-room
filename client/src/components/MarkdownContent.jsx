import ReactMarkdown from 'react-markdown'

export default function MarkdownContent({ content = '' }) {
  return (
    <div className="ui-markdown">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  )
}
