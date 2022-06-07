# abc2book
lookup  a list of  tunes on thesession.org and generate a printable book

[Try it out](https://tunebook.syntithenai.com/)

## Resources

- https://thesession.org/
- http://www.folktunefinder.com/
- https://tunearch.org/wiki/TTA
- http://trillian.mit.edu/~jc/music/book/
- https://abcnotation.com/
- www.norbeck.nu/abc/
- http://www.joe-offer.com/folkinfo/S.html
- http://www.fresnostate.edu/folklore/Olson/
- http://www.kiwifolk.org.nz/tunes.html
- http://www.stephenmerrony.co.uk/ABC/Carols/
- https://bushtraditions.wiki/tunes/index.php/Advanced_Search
- https://sheetmusic-free.com/
http://jimsrootsandblues.com/fiddle-tune-notation/
eval(document.querySelector('.entry-content script').innerText.split("\n")[2]); console.log(abc)

## Code Libraries

- https://paulrosen.github.io/abcjs/

- https://github.com/peterkhayes/pitchfinder

- https://www.qrcode-monkey.com/#
- https://github.com/opensheetmusicdisplay/opensheetmusicdisplay

## Story

This project started as a programmatic way of printing the first few bars of a bunch of tunes as a cheatsheet.
It's evolved into a tool to organise, edit and play tunes in ABC music notation format.

There are many websites offering folk and bluegrass tunes in ABC format so wanting tools to help me importing and selecting and fixing tunes into arrangements as I know them with chords has directed the development.

Lyric search and the chord wizard have made it quick to import a harmony framework enough to play audio for a bunch of songs I've learnt over the years.

It is is possible to write to create decent sounding music with ABC to midi and good soundfonts however most of what I have curated has been minimal. A clunky auto generated piano harmony and optionally the melody. It is a practice/organisation tool.

MusicXML is the wide spread standard for distributing detailed musical scores. Tools like MuseScore offer the ability to deal with complicated music.
This tool offers to import MusicXML but the underlying library only works for simple single line melodies.

If you need to work with piano or orchestral scores, use another tool.
This tool is best suited to musicians wanting to organise simple tunes and songs.


To make sure this project only costs me time, it is a "Progressive Web App" hosted on Github. Once loaded (or installed as a webapp), most of the features work (including audio rendering of any tunes in your Tune Book) without the Internet. To allow login and sharing of tune books and audio recordings across devices and with other users, a Google account is required. 







