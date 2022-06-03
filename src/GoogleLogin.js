import {useState, useRef} from 'react'
import useGoogleLogin from './useGoogleLogin' 
import useGoogleDocument from './useGoogleDocument' 

export default function GoogleLogin(props) {
    //var [googleSheetId, setGoogleSheetId] = useState(null)
    //var [accessToken, setAccessToken] = useState(null)
    const [message, setMessage] = useState('')
    const [documentId, setDocumentId] = useState('')
    //var scopes = Array.isArray(props.scopes) ? props.scopes : ['email', 'profile', 'https://www.googleapis.com/auth/userinfo.profile' 'openid' 'https://www.googleapis.com/auth/userinfo.email']
    var scopes = ['email', 'profile', 'https://www.googleapis.com/auth/userinfo.profile', 'openid', 'https://www.googleapis.com/auth/userinfo.email']
    var {token, login, logout, refresh} = useGoogleLogin({scopes: scopes, usePrompt: false, loginButtonId: 'google_login_button' })
    var docs = useGoogleDocument({token, refresh})
    
    return <div>
      <h1>Login</h1>
      <div>{JSON.stringify(token)}</div>
      <button id="google_login_button" >Login</button>
      <button onClick={function() {login()}}  >refresh</button>
      <button onClick={function() {refresh(['https://www.googleapis.com/auth/drive.file'])}}  >perms</button>
      {(token && token.accessToken) && <button onClick={function() {logout()}} id="google_logout_button" >Logout</button>}
      
      <hr/>
      <button onClick={function() {docs.findDocument('Tune Book')}}  >find</button>
      <button onClick={function() {docs.getStartPageToken()}}  >start toke</button>
      <button onClick={function() {docs.pollChanges(10000 , function(changes) {
        console.log('CHANGES',changes)
      })}}  >internval</button>
      
    </div>
    
}    
