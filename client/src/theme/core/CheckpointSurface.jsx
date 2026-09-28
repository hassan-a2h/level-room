import CheckpointIntro from '../../components/checkpoint/CheckpointIntro.jsx'
import CheckpointQuestion from '../../components/checkpoint/CheckpointQuestion.jsx'
import CheckpointResults from '../../components/checkpoint/CheckpointResults.jsx'
import styles from './learningReviewSurface.module.css'

export default function CheckpointSurface({ model, className, variant }) {
  const { actions = {}, busy = {} } = model
  return <main className={[styles.root, className].filter(Boolean).join(' ')} data-theme-view="CheckpointView" data-view-model="connected" data-pack-style={variant}>
    {model.phase === 'intro' && <CheckpointIntro
      moduleTitle={model.module?.title || ''} outcomes={model.outcomes} lessonCount={model.module?.lessons?.length || 0}
      ready={model.ready} lessonsRemaining={model.lessonsRemaining} loading={busy.loading} error={model.error?.message || ''}
      onStart={actions.start} onContinueLearning={actions.continueLearning}
    />}
    {model.phase === 'player' && <section className="checkpoint-player" aria-labelledby="checkpoint-player-title">
      <header className="checkpoint-player-header"><div><div className="checkpoint-eyebrow">{model.isPartialRetest ? 'Targeted practice' : 'Chapter checkpoint'}</div><h2 id="checkpoint-player-title">{model.module?.title || 'Your learning, together'}</h2></div>
        <div className="checkpoint-save-state" role="status" aria-live="polite">{model.saveState === 'saving' ? 'Saving your place…' : model.saveState === 'saved' ? 'Saved as you go' : model.saveState === 'error' ? 'Save paused — we’ll retry when you continue' : 'Autosave is on'}</div>
      </header>
      <div className="checkpoint-progress-row"><span>{model.answeredCount} of {model.questions.length} answered</span><div className="checkpoint-progress-track" role="progressbar" aria-label="Checkpoint questions answered" aria-valuemin={0} aria-valuemax={model.questions.length} aria-valuenow={model.answeredCount}><span style={{ width: `${model.questions.length ? (model.answeredCount / model.questions.length) * 100 : 0}%` }} /></div></div>
      {model.error?.message && <div className="ui-alert ui-alert-danger checkpoint-inline-error" role="alert">{model.error.message}</div>}
      <nav className="checkpoint-question-nav" aria-label="Checkpoint questions">{model.questions.map((question, index) => {
        const answered = Boolean(model.answers[question.id]?.trim())
        return <button key={question.id} type="button" className={`checkpoint-question-nav-item${index === model.currentIndex ? ' is-current' : ''}${answered ? ' is-answered' : ''}`} aria-label={`Question ${index + 1}${index === model.currentIndex ? ', current' : ''}${answered ? ', answered' : ', unanswered'}`} aria-current={index === model.currentIndex ? 'step' : undefined} onClick={() => actions.selectQuestion(index)}>{answered ? '✓' : index + 1}</button>
      })}</nav>
      {model.currentQuestion && <CheckpointQuestion question={model.currentQuestion} answer={model.answers[model.currentQuestion.id] || ''} index={model.currentIndex} total={model.questions.length} onAnswerChange={actions.answer} answerRef={model.answerRef} disabled={busy.loading} />}
      <footer className="checkpoint-player-actions"><button className="ui-button ui-button-secondary" type="button" onClick={actions.previous} disabled={model.currentIndex === 0 || busy.loading}>← Previous</button>
        {model.currentIndex < model.questions.length - 1
          ? <button className="ui-button ui-button-primary" type="button" onClick={actions.next} disabled={busy.loading}>Next question →</button>
          : <button className="ui-button ui-button-primary" type="button" onClick={actions.review} disabled={busy.loading}>Review answers →</button>}
      </footer>
    </section>}
    {model.phase === 'answer-review' && <section className="checkpoint-answer-review" aria-labelledby="checkpoint-answer-review-title">
      <p className="checkpoint-eyebrow">Before you submit</p><h2 id="checkpoint-answer-review-title">Review your answers</h2><p className="ui-text-secondary">Your answers are saved as you go. You can make changes before the checkpoint is scored.</p>
      <ol className="checkpoint-review-answers">{model.questions.map((question, index) => <li key={question.id}><div><span>Question {index + 1}</span><h3>{question.text}</h3><p>{question.type === 'choice' ? question.options?.find((option) => option.id === model.answers[question.id])?.label || 'No answer yet' : model.answers[question.id] || 'No answer yet'}</p></div><button type="button" className="ui-button ui-button-secondary" onClick={() => actions.editQuestion(index)}>Edit answer</button></li>)}</ol>
      {model.error?.message && <div className="ui-alert ui-alert-danger" role="alert">{model.error.message}</div>}
      <div className="checkpoint-player-actions"><button className="ui-button ui-button-secondary" type="button" onClick={actions.backToQuestions}>Back to questions</button><button className="ui-button ui-button-primary" type="button" onClick={actions.submit} disabled={busy.loading}>{busy.loading ? 'Checking your work…' : 'Submit checkpoint'}</button></div>
    </section>}
    {model.phase === 'results' && model.evaluation && <CheckpointResults
      evaluation={model.evaluation} outcomes={model.outcomes} moduleLessons={model.module?.lessons || []} questions={model.questions} answers={model.answers}
      loading={busy.loading} error={model.error?.message || ''} onBack={actions.back} onRetake={actions.retake} onPartialRetest={actions.partialRetest} onReviewLesson={actions.reviewLesson}
    />}
  </main>
}
