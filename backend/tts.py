import os
from dotenv import load_dotenv
import requests
import time

start = time.time()
load_dotenv()

# pip install requests
import requests

url = "https://api.lemonfox.ai/v1/audio/speech"
headers = {
  "Authorization": os.getenv('LEMONFOX_TTS'),
  "Content-Type": "application/json"
}
data = {
  "input": "Football is a family of team sports in which the object is to get the ball over a goal line, into a goal, or between goalposts using merely the body (by carrying, throwing, or kicking).[1][2][3] Unqualified, the word football generally means the form of football that is the most popular where the word is used. Sports commonly called football include association football (known as soccer in Australia, Canada, South Africa, the United States, and sometimes in Ireland and New Zealand); Australian rules football; Gaelic football; gridiron football (specifically American football, arena football, or Canadian football); International rules football; rugby league football; and rugby union football.[4] These various forms of football share, to varying degrees, common origins and are known as football codes.",
  "voice": "sarah",
  "response_format": "mp3"
}


response = requests.post(url, headers=headers, json=data)
with open("speech.mp3", "wb") as f:
  f.write(response.content)
end = time.time()
print(end-start)