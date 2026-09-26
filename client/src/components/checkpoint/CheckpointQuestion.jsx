export default function CheckpointQuestion({ question, answer = '', index, total, onAnswerChange, answerRef, disabled = false }) {
  const headingId = `checkpoint-question-${question.id}`
  const answered = Boolean(answer.trim())
  return (
    <article className="checkpoint-question-card" aria-labelledby={headingId}>
      <div className="checkpoint-question-meta">
        <span>Question {index + 1} <span aria-hidden="true">/</span> {total}</span>
        <span className={answered ? 'checkpoint-save-indicator is-saved' : 'checkpoint-save-indicator'}>{answered ? 'In progress' : 'Take your time'}</span>
      </div>
      <h2 id={headingId} className="checkpoint-question-title">{question.text}</h2>
      {question.type === 'choice' ? (
        <fieldset className="checkpoint-options" disabled={disabled}>
          <legend className="sr-only">Choose one answer</legend>
          {question.options.map((option, optionIndex) => {
            const selected = answer === option.id
            return (
              <label key={option.id} className={`checkpoint-option${selected ? ' is-selected' : ''}`}>
                <input
                  ref={selected || (!answer && optionIndex === 0) ? answerRef : undefined}
                  type="radio"
                  name={question.id}
                  value={option.id}
                  checked={selected}
                  onChange={() => onAnswerChange(question.id, option.id)}
                />
                <span className="checkpoint-option-marker" aria-hidden="true">{String.fromCharCode(65 + optionIndex)}</span>
                <span>{option.label}</span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        <label className="checkpoint-written-answer">
          <span className="sr-only">Your response</span>
          <textarea
            ref={answerRef}
            value={answer}
            onChange={(event) => onAnswerChange(question.id, event.target.value)}
            placeholder="Write your thinking here…"
            maxLength={5000}
            rows={6}
            disabled={disabled}
            aria-describedby={`${headingId}-hint`}
          />
          <span id={`${headingId}-hint`} className="checkpoint-answer-hint">A few clear sentences are plenty. Your goal is to show your thinking.</span>
        </label>
      )}
      <p className="checkpoint-question-footnote">This is a learning checkpoint, not a race. You can revisit your answers before submitting.</p>
    </article>
  )
}
