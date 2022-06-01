import jwt_decode from "jwt-decode";
import axios from 'axios'
import {useState, useRef} from 'react'

export default function GoogleLogin({tunebook, mergeLoadedSheet}) {

    var [googleSheetId, setGoogleSheetId] = useState(null)
    var [accessToken, setAccessToken] = useState(null)
    var client = useRef(null)
    var clientId = process.env.REACT_APP_GOOGLE_CLIENT_ID 
     
    function handleCredentialResponse(response) {
      var decoded = jwt_decode(response.credential)
      //console.log(decoded.email,decoded.family_name, decoded.given_name, decoded.name, decoded.picture, decoded)
      
      function initClient() {
        client = global.window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          prompt: '',
          scope: 'https://www.googleapis.com/auth/drive.metadata.readonly \
          https://www.googleapis.com/auth/drive.file \
          https://www.googleapis.com/auth/spreadsheets',
          callback: (tokenResponse) => {
            setAccessToken(tokenResponse.access_token)
            findTuneBookInDrive()
          },
        });
      } 
       
      function getToken() {
        client.requestAccessToken();
      }
      //function revokeToken() {
        //global.window.google.accounts.oauth2.revoke(access_token, () => {console.log('access token revoked')});
      //}
      
      function getSheetById(id,callback) {
        if (id) {
          axios({
            method: 'get',
            url: 'https://www.googleapis.com/drive/v3/files/'+id+'?alt=media',
            headers: {'Authorization': 'Bearer '+accessToken},
          }).then(function(postRes) {
            callback(postRes)
            console.log(postRes)
          }).catch(function(e) {
            //getToken()
          })
        }
      }
      
      function updateSheetById(id,data,callback, accessToken) {
        if (id) {
          axios({
            method: 'patch',
            url: 'https://www.googleapis.com/upload/drive/v3/files/'+id+"?uploadType=media",
            headers: {'Authorization': 'Bearer '+accessToken},
            data: data,
          }).then(function(postRes) {
            callback(postRes)
            console.log(postRes)
          }).catch(function(e) {
            //getToken()
          })
        }
          
      }
     
      
      function createTuneSheet() {
        var  data = {
          "description": "Document for ABC Tune Book data",
          "kind": "drive#file",
          "name": "ABC Tune Book",
          "mimeType": "application/vnd.google-apps.document" //"vnd.google-apps.spreadsheet"
        }
        axios({
          method: 'post',
          url: 'https://www.googleapis.com/drive/v3/files',
          data: data,
          headers: {'Authorization': 'Bearer '+accessToken},
        }).then(function(postRes) {
          setGoogleSheetId(postRes.data.id)
          updateSheetById(postRes.data.id, {abc: tunebook.toAbc()}, function(updated) {
            //props.mergeLoadedSheet(postRes)
          }, accessToken ? accessToken : access_token).catch(function(e) {
            //getToken()
          })
          
        })
      }
      
      function findTuneBookInDrive() {
          var xhr = new XMLHttpRequest();
          xhr.onload = function (res) {
            if (res.target.responseText) {
              var response = JSON.parse(res.target.responseText)
              if (response && response.files && Array.isArray(response.files) && response.files.length > 0)  {
                // load whole file
                setGoogleSheetId(response.files[0].id)
                getSheetById(response.files[0].id, function(fullSheet) {
                    mergeLoadedSheet(fullSheet)
                })
              } else {
                // create file
                createTuneSheet()
              }
            }
          };
          //mimeType = 'application/vnd.google-apps.spreadsheet' and 
          var filter = "?q="+ encodeURIComponent("name='ABC Tune Book'") //" //+urlencode()   //'"+decoded.name+"\'s Tune Book'" 
          xhr.open('GET', 'https://www.googleapis.com/drive/v3/files' + filter);
          xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
          xhr.send();
      }
       //application/vnd.google-apps.spreadsheet
      initClient()
      //getToken()
    } 
    
    
    window.onload = function () {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse
      });
      window.google.accounts.id.renderButton(
        document.getElementById("loginbuttondiv"),
        { theme: "outline", size: "large" }  // customization attributes
      );
      window.google.accounts.id.prompt(); // also display the One Tap dialog
    }
    
}    
