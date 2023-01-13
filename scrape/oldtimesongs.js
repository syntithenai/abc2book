var songBlob=`A Distant Land To Roam
A Few Old Memories
Across The Blue Sea
Adieu False Heart
Ain’t No Grave
Am I Born To Die
Amazing Grace
Aragon Mill
Are You From Dixie
Are You Missing Me
Arkansas Traveler
Balo’s Song
Barbara Allen
Battle Of New Orleans
Bed By The Window
Been All Round This World
Better Late Than Never
Better Times A-Coming
Big Ball In Boston
Big Midnight Special
Big Rock Candy Mountain
Bile Them Cabbage Down
Bitter Green
Black Eyed Susie
Blackest Crow
Bonaparte’s Retreat
Bravest Cowboy
Bring Back My Blue-Eyed Boy To Me
Bringing In The Georgia Mail
Brown’s Ferry Blues
Buffalo Gals
Bully Of The Town
Bummin’ An Old Freight Train
Bury Me Beneath The Willow
Bury Me Not on the Lone Prairie
By The Mark
Can’t You Hear Me Calling
Careless Love
Casey Jones
Catfish John
Charmin’ Betsy
Chittlin’ Cookin’ Time In Cheatham County
Cindy
Cluck Old Hen
Corina Corina
Crawdad
Cripple Creek
Custom Made Woman Blues
Darlin Nellie Gray
Deep River Blues
Didn’t Leave Nobody But The Baby
Down Among The Budded Roses
Down To The River To Pray
Down To The Valley To Pray
Dying Californian
Dying Mother, The
Faded Coat Of Blue
Fair And Tender Ladies
Falling Leaves
Farewell Nellie
Fly Around My Blue-Eyed Gal
Foggy Mountain Top
Fox On The Run
Free Little Bird
Go Tell Aunt Rodie
Goin Where I’ve Never Been Before
Going ’round This World
Going Across the Mountain
Going To The West
Going to Write Me a Letter
Gonna Lay Down My Old Guitar
Greenlight On The Southern
Gum Tree Canoe
Handsome Molly
Happy Sunny Side Of Life, The
Hard Luck in Heaven
Hard Rocking Chair
Hard Times Come Again No More
He Will Set Your Fields On Fire
Hello Stranger
High On A Mountain
Home
Honey Babe Blues
Hop High My Lula Gal
Hot Corn, Cold Corn
Hush Little Baby
I Don’t Love Nobody
I Have No Mother Now
I Haven’t Seen Mary In Years
I Saw a Man at the Close of Day
I’m Going Across The Sea
I’m So Lonesome I Could Cry
I’ve Endured
I’ve Got a Bulldog
I’ve Waited As Long As I Can
In The Highways
In The Jailhouse Now
Innocent Road
Jordan Am A Hard Road To Travel
Julianne
Just A Few More Days
Just Ain’t
Keep On The Firing Line
Kickin’ Mule
Last Train From Poor Valley
Lazy John
Letter From My Darlin
Little Liza Jane
Little Sadie
Little Satchel
Lone Pilgrim
Lonesome
Long Time Travelin’
Look Up Look Down That Lonesome Road
Love Will Roll the Clouds Away
Lover’s Return
Lowest Valley, The
Man Of Constant Sorrow
Matty Groves
My Deceitful Heart
My Love Lies in the Ground
My Love Lies in the Ground
New River Train
Ninety and Nine
Oh Death
Oh Suzanna
Old Bill Miner
Old Black Choo Choo
Old Dan Tucker
Old Joe Clark
Old Man Below
Old River
Omie Wise
One Day I Will
One Morning in May
Only the Leading Role Will Do
Over Yonder in the Graveyard
Peg and Awl
Police
Poor Old Dirt Farmer
Pretty Saro
Rebel Soldier
Red Rocking Chair
Red Sails In The Sunset
Rock About My Saro Jane
Rose of Alabama
Rove Riley Rove
Sal’s Got A Meatskin
Say Darlin Say
See That My Grave Is Kept Clean
Seven Years Blues
Shady Grove
Short Life Of Trouble
Sing Me a Song
Six Feet of Earth Makes Us All of One Size
Some Old Day
Southern Railroad Line
Sunny Side Of Life
Sweet Sunny South
Sweetheart, You’ve Done Me Wrong
Teardrops In My Eyes
The Bramble And The Rose
The Butcher Boy
The Cuckoo Bird
The Green Rolling Hills Of West Virginia
The Greenville Trestle
The Legend Of The Rebel Soldier
The Lost Soul
The Train That Carried My Girl From Town
The Waves On The Sea
Thinking About You
This Little Sparrow
This Old Song
Those Brown Eyes
Those Two Blue Eyes
Throw Down Your Earthly Crown
Times Are Getting Hard
Tiny Broken Heart
Tom Dooley
Train on the Island
Trials Troubles Tribulations
Trouble In Mind
Twilight is Stealing
Uncle Joe
Uncloudy Day
Walk On Boy
Water Bound
Waterbound
Watermelon On The Vine
Wayfaring Stranger
When I Can Read My Titles Clear
When The Roses Bloom In Dixieland
Where the Wild Wild Flowers Grow
Whiskey Deaf Whiskey Blind
Who Killed Poor Robin
Who’s Going Down To Town
Who’s Gonna Shoe Your Pretty Little Foot
Will You Be Loving Another Man
Willie Moore
Winter’s Night
You Are My Flower
You Are My Sunshine
You Lead Me to the Wrong
You’ve Been A Friend To Me
Your Greedy Heart
Your Lone Journey`


var songs = songBlob.split("\n")
var output = []
songs.forEach(function(song, sk) {
	output.push('X:'+sk)
	output.push('T:'+song)
	output.push('')
	
})

console.log(output.join("\n"))
