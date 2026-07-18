import PrivacyContent from '../components/PrivacyContent'
import { useDocumentTitle } from '../pageTitle'

export default function PrivacyPage() {
  useDocumentTitle('Privacy')

  return <div>
	<PrivacyContent/>
</div>
}
