export default function useCheckOnlineStatus() {
    const PING_RESOURCE = "https://ipv4.icanhazip.com";
    const TIMEOUT_TIME_MS = 3000;
 
    const timeout = (time: number, promise: Promise) => {
      return new Promise(function(resolve, reject) {
        setTimeout(() => {
          reject(new Error("Request timed out."));
        }, time);
        promise.then(resolve, reject);
      });
    };

    const checkOnlineStatus = async () => {
      const controller = new AbortController();
      const { signal } = controller;
      //console.log('check online',navigator.onLine)
      // If the browser has no network connection return offline
      if (!navigator.onLine) return navigator.onLine;

      //
      try {
        await timeout(
          TIMEOUT_TIME_MS,
          fetch(PING_RESOURCE, {
            method: "GET",
            signal
          })
        );
        return true;
      } catch (error) {
        // Error Log
        console.error(error);

        // This can be because of request timed out
        // so we abort the request for any case
        controller.abort();
      }
      return false;
    };
    
    
    return checkOnlineStatus
}
