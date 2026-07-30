import React from 'react'
import ReactDOM from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import '@app/pages/LessonsPage.css'
import '@app/components/LessonQuizPlayer.css'
import '@app/components/LessonFeedback.css'
import './LessonPreview.css'
import LessonPreviewApp from './LessonPreviewApp'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LessonPreviewApp />
  </React.StrictMode>
)
