export function defaultQuestions(company) {
  const name = String(company || '').trim() || 'this company'
  return [
    `Why would you like to work at ${name}?`,
    'Why do you think you are a good fit for this role?',
  ]
}

export function normalizeQuestions(value, company) {
  if (value == null) return defaultQuestions(company)
  const raw = Array.isArray(value) ? value : [value?.q1, value?.q2, value?.q3]
  return raw.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
}

export function padQuestions(value, company) {
  const list = normalizeQuestions(value, company)
  return [list[0] || '', list[1] || '', list[2] || '']
}

export function questionsForJob(job) {
  return normalizeQuestions(job?.questions, job?.company)
}

export function parseAnswers(body = {}) {
  try {
    const parsed = JSON.parse(body.answers || '[]')
    if (Array.isArray(parsed) && parsed.length) {
      return parsed
        .map((item) => ({
          question: String(item?.question || '').trim().slice(0, 300),
          answer: String(item?.answer || '').trim().slice(0, 8000),
        }))
        .filter((item) => item.question && item.answer)
    }
  } catch {
    // use legacy fields
  }
  return [
    { question: String(body.whyCompanyQuestion || '').trim(), answer: String(body.whyCompany || '').trim() },
    { question: String(body.whyFitQuestion || '').trim(), answer: String(body.whyFit || '').trim() },
    { question: String(body.aiToolsQuestion || '').trim(), answer: String(body.aiTools || '').trim() },
  ].filter((item) => item.answer)
}
