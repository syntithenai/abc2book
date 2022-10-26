import axios from 'axios'



const data = {
    "kind": "youtube#searchListResponse",
    "etag": "v7KsJNu8DW-lRTGr4nifyq44H6c",
    "nextPageToken": "CAoQAA",
    "regionCode": "AU",
    "pageInfo": {
        "totalResults": 1000000,
        "resultsPerPage": 10
    },
    "items": [
        {
            "kind": "youtube#searchResult",
            "etag": "Jb-NiTI2JZclZ9pQYVlUGxiizoo",
            "id": {
                "kind": "youtube#video",
                "videoId": "_PNL5N-XQ20"
            },
            "snippet": {
                "publishedAt": "2022-10-23T09:43:38Z",
                "channelId": "UCayXJ91K9BE86OvbDeHHrJg",
                "title": "BEST FUNNY CATS COMPILATION 2022😂|  Cute and Funny Cat Videos to Keep You Smiling!😻",
                "description": "Hello international cat lovers ! Welcome to the funniest cat compilation video of 2022! The best and cutest cat videos ever!",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/_PNL5N-XQ20/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/_PNL5N-XQ20/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/_PNL5N-XQ20/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "International Cat",
                "liveBroadcastContent": "none",
                "publishTime": "2022-10-23T09:43:38Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "NLuplh4iyHkUbTBvHnnGneamtZc",
            "id": {
                "kind": "youtube#video",
                "videoId": "4hz0icZKhDQ"
            },
            "snippet": {
                "publishedAt": "2022-10-24T17:00:06Z",
                "channelId": "UCINb0wqPz-A0dV9nARjJlOQ",
                "title": "Cat Would Break People’s Windows To Stay Out Of The Cold Until This Woman Took Him In | The Dodo",
                "description": "Feral cat would hide in a cardboard box 'cause he was so scared to be inside a house — watch what happens when his new mom ...",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/4hz0icZKhDQ/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/4hz0icZKhDQ/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/4hz0icZKhDQ/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "The Dodo",
                "liveBroadcastContent": "none",
                "publishTime": "2022-10-24T17:00:06Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "Kby-Hyb9DWhvZZRVsTb-aDigt9k",
            "id": {
                "kind": "youtube#video",
                "videoId": "ITbZ3HSS4C0"
            },
            "snippet": {
                "publishedAt": "2022-10-24T19:27:26Z",
                "channelId": "UCYbggI6qVceWa1_1dfH0hMA",
                "title": "FUNNY CAT MEMES COMPILATION OF 2022 PART 63",
                "description": "Try Not To Laugh Challenge is a hilarious compilation of Funny and cute Animal Videos, featuring some of the funniest cats ...",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/ITbZ3HSS4C0/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/ITbZ3HSS4C0/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/ITbZ3HSS4C0/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "Meowthemall",
                "liveBroadcastContent": "none",
                "publishTime": "2022-10-24T19:27:26Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "vgDPzYHJZ6gaRK7PqzmN56zfNqE",
            "id": {
                "kind": "youtube#video",
                "videoId": "hY7m5jjJ9mM"
            },
            "snippet": {
                "publishedAt": "2017-05-31T09:30:02Z",
                "channelId": "UC9obdDRxQkmn_4YpcBMTYLw",
                "title": "CATS will make you LAUGH YOUR HEAD OFF - Funny CAT compilation",
                "description": "Cats are amazing creatures because they make us laugh all the time! Watching funny cats is the hardest try not to laugh challenge ...",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/hY7m5jjJ9mM/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/hY7m5jjJ9mM/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/hY7m5jjJ9mM/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "Tiger FunnyWorks",
                "liveBroadcastContent": "none",
                "publishTime": "2017-05-31T09:30:02Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "o5uUCOyRVC6_4_K6STSBf78wglE",
            "id": {
                "kind": "youtube#video",
                "videoId": "JxS5E-kZc2s"
            },
            "snippet": {
                "publishedAt": "2015-09-05T06:00:17Z",
                "channelId": "UCVaQwUU0NLkBeO6m7_j2U2Q",
                "title": "Funny Cats Compilation (Most Popular) Part 1",
                "description": "Video is compiled from all the funny by cute cats of worldwide ➔ Subscribe for NoCAT NoLiFE: http://goo.gl/sxSqUV (Help me ...",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/JxS5E-kZc2s/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/JxS5E-kZc2s/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/JxS5E-kZc2s/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "NoCAT NoLiFE 2",
                "liveBroadcastContent": "none",
                "publishTime": "2015-09-05T06:00:17Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "tRNEdOPnOiylCqYEUucrQxdYAqw",
            "id": {
                "kind": "youtube#video",
                "videoId": "SIkephggpMg"
            },
            "snippet": {
                "publishedAt": "2022-10-24T14:00:28Z",
                "channelId": "UCINb0wqPz-A0dV9nARjJlOQ",
                "title": "Puppy Who Couldn&#39;t Stop Shaking Loves Wrestling With A Cat | The Dodo Little But Fierce",
                "description": "Watch this puppy go from shaking like a leaf to wrestling with a cat Keep up with Sidewalk Specials on YouTube: ...",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/SIkephggpMg/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/SIkephggpMg/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/SIkephggpMg/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "The Dodo",
                "liveBroadcastContent": "none",
                "publishTime": "2022-10-24T14:00:28Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "ex8f_lTdZczIEyoic0YxkBt94HY",
            "id": {
                "kind": "youtube#video",
                "videoId": "P3h45znNqCQ"
            },
            "snippet": {
                "publishedAt": "2021-03-30T16:00:07Z",
                "channelId": "UCTDJ9osmaIty0MVkUZymVmQ",
                "title": "15 Abnormally Strange Cats That Actually Exist",
                "description": "The internet loves cats. And that other part of existence, you know, the actual world, that loves cats too. Why? Because they're cats ...",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/P3h45znNqCQ/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/P3h45znNqCQ/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/P3h45znNqCQ/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "Amerikano",
                "liveBroadcastContent": "none",
                "publishTime": "2021-03-30T16:00:07Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "FbO_KZiCn1Btdd13XwSDn8RskO4",
            "id": {
                "kind": "youtube#video",
                "videoId": "P75hThqqgN0"
            },
            "snippet": {
                "publishedAt": "2022-10-24T09:37:02Z",
                "channelId": "UCSDlqCwLnIzi7txhsbOEJPQ",
                "title": "Battle Cats - The True Hacked Battle Cats Episode 2!",
                "description": "",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/P75hThqqgN0/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/P75hThqqgN0/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/P75hThqqgN0/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "Stargazer",
                "liveBroadcastContent": "none",
                "publishTime": "2022-10-24T09:37:02Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "1KIPpl8vZMEuoesLZioXV-4p18k",
            "id": {
                "kind": "youtube#video",
                "videoId": "xbs7FT7dXYc"
            },
            "snippet": {
                "publishedAt": "2018-02-13T15:56:36Z",
                "channelId": "UCPJXfmxMYAoH02CFudZxmgg",
                "title": "Videos for Cats to Watch - 8 Hour Birds Bonanza - Cat TV Bird Watch",
                "description": "Videos for Cats to Watch Birds - Cat TV Bird Watch Video Produced by Paul Dinning - Wildlife in Cornwall #PaulDinning.",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/xbs7FT7dXYc/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/xbs7FT7dXYc/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/xbs7FT7dXYc/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "Paul Dinning",
                "liveBroadcastContent": "none",
                "publishTime": "2018-02-13T15:56:36Z"
            }
        },
        {
            "kind": "youtube#searchResult",
            "etag": "-oM2HXsB39jhNPOIuyD0EuV_xOw",
            "id": {
                "kind": "youtube#video",
                "videoId": "eX2qFMC8cFo"
            },
            "snippet": {
                "publishedAt": "2020-10-29T12:00:27Z",
                "channelId": "UCYPrd7A27nLhQONcCIfFTaA",
                "title": "Funniest Cats 😹 - Don&#39;t try to hold back Laughter 😂 - Funny Cats Life",
                "description": "Funniest Cats - Don't try to hold back Laughter Watch more cute animals! https://youtube.com/playlist?list=PLH.",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/eX2qFMC8cFo/default.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/eX2qFMC8cFo/mqdefault.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/eX2qFMC8cFo/hqdefault.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "Funny Cats Life",
                "liveBroadcastContent": "none",
                "publishTime": "2020-10-29T12:00:27Z"
            }
        }
    ]
}


function useYouTubeSearch() {
    
    function searchYouTube(query) {
      //axios.get('https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=' + query + '&key='+process.env.REACT_APP_GOOGLE_API_KEY).then(function(res) {
         //console.log(res) 
          
      //})
      var results = []
      data['items'].forEach(function(item) {
          //console.log(item)
          if (item.id && item.id.kind === "youtube#video") {
            results.push(
                {
                    id: item.id.videoId, 
                    title: item.snippet.title, 
                    description: item.snippet.description, 
                    image: item.snippet.thumbnails['default']
                }
            )
          }
      })
      console.log(results)
      return results
    }
  
  return {searchYouTube}
}
export default useYouTubeSearch
