import {useEffect} from 'react'
import { prefersFreshAppLoad } from './appFreshLoadUtils'

export default function useServiceWorker() {
   const registerServiceWorker = async () => {
   if (prefersFreshAppLoad()) return
   if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register(
          '/sw.js',
          {
            scope: '/',
          }
        );
        if (registration.installing) {
        } else if (registration.waiting) {
        } else if (registration.active) {
        }
      } catch (error) {
        console.error(`Service Registration failed with ${error}`);
      }
    }
  };
   useEffect(function() {
    if (process.env.NODE_ENV !== 'production') return
    registerServiceWorker()
   },[])
}
