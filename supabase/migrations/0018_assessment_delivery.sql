-- A form can now be given two ways, and a level's form may have one of each:
-- by an adult on the assessor screen (delivery 'assessor'), or played by
-- the child as a game on their own device (delivery 'game'). The teacher
-- picks which when starting it.
--
-- 1. assessments.delivery, filled in from each row's items (an assessor-led
--    form's items are all type 'assessor', a game's never are), and kept
--    in step with them by a check.
-- 2. One version series, and at most one active version, per level, form
--    and delivery.
-- 3. Level 1 Form A gets its game version: the ReadWell Level 1 Form A
--    parts adapted for a child to play alone, generated from
--    src/lib/readwell/level1FormAGame.ts (level1FormAGame.test.ts keeps
--    this copy in step). Story reading lines count toward a new
--    "Story reading" skill area.

alter table public.assessments add column delivery text;
update public.assessments
set delivery = case when items -> 0 ->> 'type' = 'assessor' then 'assessor' else 'game' end;
alter table public.assessments alter column delivery set not null;
alter table public.assessments add constraint assessments_delivery_check
  check (delivery in ('assessor', 'game'));
alter table public.assessments add constraint assessments_delivery_matches_items
  check (items -> 0 ->> 'type' is null or (items -> 0 ->> 'type' = 'assessor') = (delivery = 'assessor'));

alter table public.assessments drop constraint assessments_level_form_version_key;
alter table public.assessments add constraint assessments_level_form_delivery_version_key
  unique (level, form, delivery, version);

drop index public.assessments_one_active_per_form;
create unique index assessments_one_active_per_form_delivery
  on public.assessments (level, form, delivery)
  where is_active and form is not null;

insert into public.skill_areas (key, name) values ('storyReading', 'Story reading')
on conflict (key) do nothing;

insert into public.assessments (level, form, delivery, version, items, is_active)
select 1, 'A', 'game', 1, '[
    {"id":"LC01","skillAreaKey":"storyListening","type":"choice","prompt":"What animal does Kwaku have?","say":"Listen to my story. Kwaku has a little brown goat. Every morning he gives the goat water. One day the gate was open, and the goat ran away. Kwaku looked behind the house. He looked under the mango tree. Then he heard a sound from the kitchen. The goat was eating the yam! Kwaku laughed and tied the goat with a rope. Now answer my questions. What animal does Kwaku have? A goat, a hen, or a dog?","options":[{"text":"🐐 A goat","isCorrect":true},{"text":"🐔 A hen","isCorrect":false},{"text":"🐕 A dog","isCorrect":false}]},
    {"id":"LC02","skillAreaKey":"storyListening","type":"choice","prompt":"What does Kwaku give the goat every morning?","say":"What does Kwaku give the goat every morning? Milk, water, or grass?","options":[{"text":"🥛 Milk","isCorrect":false},{"text":"💧 Water","isCorrect":true},{"text":"🌿 Grass","isCorrect":false}]},
    {"id":"LC03","skillAreaKey":"storyListening","type":"choice","prompt":"Where did Kwaku find the goat?","say":"Where did Kwaku find the goat? Under the mango tree, behind the house, or in the kitchen?","options":[{"text":"🥭 Under the mango tree","isCorrect":false},{"text":"🏠 Behind the house","isCorrect":false},{"text":"🍳 In the kitchen","isCorrect":true}]},
    {"id":"LC04","skillAreaKey":"storyListening","type":"choice","prompt":"Why was the goat able to run away?","say":"Why was the goat able to run away? The gate was open, it was raining, or Kwaku was asleep?","options":[{"text":"🚪 The gate was open","isCorrect":true},{"text":"🌧️ It was raining","isCorrect":false},{"text":"😴 Kwaku was asleep","isCorrect":false}]},
    {"id":"LC05","skillAreaKey":"storyListening","type":"choice","prompt":"Why do you think Kwaku tied the goat with a rope?","say":"Why do you think Kwaku tied the goat with a rope? So it can dance, so it cannot run away again, or so it can swim?","options":[{"text":"💃 So it can dance","isCorrect":false},{"text":"🪢 So it cannot run away again","isCorrect":true},{"text":"🏊 So it can swim","isCorrect":false}]},
    {"id":"VO01","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the ram.","say":"Tap the ram.","options":[{"text":"🐔","isCorrect":false},{"text":"🐏","isCorrect":true},{"text":"🐕","isCorrect":false},{"text":"🐟","isCorrect":false}]},
    {"id":"VO02","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the web.","say":"Tap the web.","options":[{"text":"🥅","isCorrect":false},{"text":"🪢","isCorrect":false},{"text":"🕸️","isCorrect":true},{"text":"🪺","isCorrect":false}]},
    {"id":"VO03","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the hut.","say":"Tap the hut.","options":[{"text":"🛖","isCorrect":true},{"text":"⛺","isCorrect":false},{"text":"🚗","isCorrect":false},{"text":"🌳","isCorrect":false}]},
    {"id":"VO04","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the mop.","say":"Tap the mop.","options":[{"text":"🧹","isCorrect":false},{"text":"🖌️","isCorrect":false},{"text":"🪣","isCorrect":false},{"text":":mop:","isCorrect":true}]},
    {"id":"VO05","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the tin.","say":"Tap the tin.","options":[{"text":"☕","isCorrect":false},{"text":"🥫","isCorrect":true},{"text":"🧴","isCorrect":false},{"text":"🧺","isCorrect":false}]},
    {"id":"VO06","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the bucket.","say":"Tap the bucket.","options":[{"text":"🍲","isCorrect":false},{"text":"🥣","isCorrect":false},{"text":"🧺","isCorrect":false},{"text":"🪣","isCorrect":true}]},
    {"id":"VO07","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the ladder.","say":"Tap the ladder.","options":[{"text":"🪜","isCorrect":true},{"text":"🪑","isCorrect":false},{"text":"🛏️","isCorrect":false},{"text":"🚪","isCorrect":false}]},
    {"id":"VO08","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the bridge.","say":"Tap the bridge.","options":[{"text":"🛣️","isCorrect":false},{"text":"🏞️","isCorrect":false},{"text":"🌉","isCorrect":true},{"text":":gate:","isCorrect":false}]},
    {"id":"VO09","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the roof.","say":"Tap the roof.","options":[{"text":"🪟","isCorrect":false},{"text":":roof:","isCorrect":true},{"text":"🚪","isCorrect":false},{"text":"🧱","isCorrect":false}]},
    {"id":"VO10","skillAreaKey":"vocabulary","type":"choice","prompt":"Tap the farmer.","say":"Tap the farmer.","options":[{"text":"🧑‍🏫","isCorrect":false},{"text":"🚕","isCorrect":false},{"text":"🧑‍🌾","isCorrect":true},{"text":"🧑‍⚕️","isCorrect":false}]},
    {"id":"CP01","skillAreaKey":"printConcepts","type":"choice","prompt":"Tap the front of the book.","say":"Tap the front of the book.","options":[{"text":":book-back:","isCorrect":false},{"text":":book-front:","isCorrect":true},{"text":"📖","isCorrect":false}]},
    {"id":"CP02","skillAreaKey":"printConcepts","type":"choice","prompt":"Tap the back of the book.","say":"Tap the back of the book.","options":[{"text":":book-front:","isCorrect":false},{"text":"📖","isCorrect":false},{"text":":book-back:","isCorrect":true}]},
    {"id":"CP03","skillAreaKey":"printConcepts","type":"choice","prompt":"Which book is the right way up, ready to read?","say":"Which book is the right way up, ready to read?","options":[{"text":":book-upside-down:","isCorrect":false},{"text":":book-front:","isCorrect":true},{"text":":book-back:","isCorrect":false}]},
    {"id":"CP04","skillAreaKey":"printConcepts","type":"choice","prompt":"Where do you start reading? Tap the first word.","say":"Look at the page. Where do you start reading? Tap the first word.","passage":"Kofi has a red hat.\nHe sits on a mat.","options":[{"text":"mat","isCorrect":false},{"text":"Kofi","isCorrect":true},{"text":"red","isCorrect":false}]},
    {"id":"CP05","skillAreaKey":"printConcepts","type":"choice","prompt":"Which arrow shows the way we read along a line?","say":"Which arrow shows the way we read along a line?","passage":"Kofi has a red hat.\nHe sits on a mat.","options":[{"text":"⬅️","isCorrect":false},{"text":"⬆️","isCorrect":false},{"text":"➡️","isCorrect":true}]},
    {"id":"CP06","skillAreaKey":"printConcepts","type":"choice","prompt":"At the end of a line, where do you go next?","say":"At the end of a line, where do you go next? To the start of the next line, back to the top, or off the page?","passage":"Kofi has a red hat.\nHe sits on a mat.","options":[{"text":"↙️ To the start of the next line","isCorrect":true},{"text":"⬆️ Back to the top","isCorrect":false},{"text":"➡️ Off the page","isCorrect":false}]},
    {"id":"CP07","skillAreaKey":"printConcepts","type":"choice","prompt":"Tap just one letter.","say":"Tap just one letter.","options":[{"text":"Kofi","isCorrect":false},{"text":"K","isCorrect":true},{"text":"a red hat","isCorrect":false}]},
    {"id":"CP08","skillAreaKey":"printConcepts","type":"choice","prompt":"Tap just one word.","say":"Tap just one word.","options":[{"text":"h","isCorrect":false},{"text":"a red hat","isCorrect":false},{"text":"hat","isCorrect":true}]},
    {"id":"CP09","skillAreaKey":"printConcepts","type":"choice","prompt":"Tap a capital letter.","say":"Tap a capital letter.","options":[{"text":"e","isCorrect":false},{"text":"K","isCorrect":true},{"text":"s","isCorrect":false}]},
    {"id":"CP10","skillAreaKey":"printConcepts","type":"choice","prompt":"Tap a full stop.","say":"Tap a full stop.","options":[{"text":",","isCorrect":false},{"text":"?","isCorrect":false},{"text":".","isCorrect":true}]},
    {"id":"SA01","skillAreaKey":"soundAwareness","type":"choice","prompt":"Which one rhymes with cat?","say":"Which one rhymes with cat? Sun, hat, or cup?","options":[{"text":"☀️ sun","isCorrect":false},{"text":"🎩 hat","isCorrect":true},{"text":"☕ cup","isCorrect":false}]},
    {"id":"SA02","skillAreaKey":"soundAwareness","type":"choice","prompt":"Which one rhymes with pen?","say":"Which one rhymes with pen? Ten, pig, or box?","options":[{"text":"🔟 ten","isCorrect":true},{"text":"🐖 pig","isCorrect":false},{"text":"📦 box","isCorrect":false}]},
    {"id":"SA03","skillAreaKey":"soundAwareness","type":"choice","prompt":"Which one rhymes with log?","say":"Which one rhymes with log? Bed, bus, or dog?","options":[{"text":"🛏️ bed","isCorrect":false},{"text":"🚌 bus","isCorrect":false},{"text":"🐕 dog","isCorrect":true}]},
    {"id":"SA04","skillAreaKey":"soundAwareness","type":"choice","prompt":"Which one starts like sun?","say":"Which one starts with the same sound as sun? Map, sock, or pig?","options":[{"text":"🗺️ map","isCorrect":false},{"text":"🧦 sock","isCorrect":true},{"text":"🐖 pig","isCorrect":false}]},
    {"id":"SA05","skillAreaKey":"soundAwareness","type":"choice","prompt":"Which one starts like mango?","say":"Which one starts with the same sound as mango? Moon, fish, or tap?","options":[{"text":"🌙 moon","isCorrect":true},{"text":"🐟 fish","isCorrect":false},{"text":"🚰 tap","isCorrect":false}]},
    {"id":"SA06","skillAreaKey":"soundAwareness","type":"choice","prompt":"Which one ends like goat?","say":"Which one ends with the same sound as goat? Sun, dog, or cat?","options":[{"text":"☀️ sun","isCorrect":false},{"text":"🐕 dog","isCorrect":false},{"text":"🐈 cat","isCorrect":true}]},
    {"id":"SA07","skillAreaKey":"soundAwareness","type":"choice","prompt":"How many claps in banana?","say":"Clap the parts of the word banana. Ba, na, na. How many claps? One, two, or three?","options":[{"text":"1","isCorrect":false},{"text":"2","isCorrect":false},{"text":"3","isCorrect":true}]},
    {"id":"SA08","skillAreaKey":"soundAwareness","type":"choice","prompt":"What word is it?","say":"Listen. Ba... nana. What word is it? Apple, banana, or pineapple?","options":[{"text":"🍎 apple","isCorrect":false},{"text":"🍌 banana","isCorrect":true},{"text":"🍍 pineapple","isCorrect":false}]},
    {"id":"LN01","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter s.","say":"Find the letter ess. Tap it.","options":[{"text":"s","isCorrect":true},{"text":"z","isCorrect":false},{"text":"c","isCorrect":false}]},
    {"id":"LN02","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter m.","say":"Find the letter em. Tap it.","options":[{"text":"n","isCorrect":false},{"text":"m","isCorrect":true},{"text":"w","isCorrect":false}]},
    {"id":"LN03","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter a.","say":"Find the letter ay. Tap it.","options":[{"text":"o","isCorrect":false},{"text":"e","isCorrect":false},{"text":"a","isCorrect":true}]},
    {"id":"LN04","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter t.","say":"Find the letter tee. Tap it.","options":[{"text":"t","isCorrect":true},{"text":"f","isCorrect":false},{"text":"l","isCorrect":false}]},
    {"id":"LN05","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter o.","say":"Find the letter oh. Tap it.","options":[{"text":"a","isCorrect":false},{"text":"o","isCorrect":true},{"text":"c","isCorrect":false}]},
    {"id":"LN06","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter b.","say":"Find the letter bee. Tap it.","options":[{"text":"d","isCorrect":false},{"text":"p","isCorrect":false},{"text":"b","isCorrect":true}]},
    {"id":"LN07","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter k.","say":"Find the letter kay. Tap it.","options":[{"text":"k","isCorrect":true},{"text":"h","isCorrect":false},{"text":"x","isCorrect":false}]},
    {"id":"LN08","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter e.","say":"Find the letter ee. Tap it.","options":[{"text":"a","isCorrect":false},{"text":"e","isCorrect":true},{"text":"c","isCorrect":false}]},
    {"id":"LN09","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter w.","say":"Find the letter double you. Tap it.","options":[{"text":"m","isCorrect":false},{"text":"v","isCorrect":false},{"text":"w","isCorrect":true}]},
    {"id":"LN10","skillAreaKey":"letterNames","type":"choice","prompt":"Tap the letter d.","say":"Find the letter dee. Tap it.","options":[{"text":"d","isCorrect":true},{"text":"b","isCorrect":false},{"text":"p","isCorrect":false}]},
    {"id":"LS01","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"apple\"? 🍎","say":"Which letter makes the first sound in apple? apple.","options":[{"text":"o","isCorrect":false},{"text":"a","isCorrect":true},{"text":"e","isCorrect":false}]},
    {"id":"LS02","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"tap\"? 🚰","say":"Which letter makes the first sound in tap? tap.","options":[{"text":"f","isCorrect":false},{"text":"l","isCorrect":false},{"text":"t","isCorrect":true}]},
    {"id":"LS03","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"sun\"? ☀️","say":"Which letter makes the first sound in sun? sun.","options":[{"text":"s","isCorrect":true},{"text":"z","isCorrect":false},{"text":"c","isCorrect":false}]},
    {"id":"LS04","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"mango\"? 🥭","say":"Which letter makes the first sound in mango? mango.","options":[{"text":"n","isCorrect":false},{"text":"m","isCorrect":true},{"text":"w","isCorrect":false}]},
    {"id":"LS05","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"pot\"? 🍲","say":"Which letter makes the first sound in pot? pot.","options":[{"text":"q","isCorrect":false},{"text":"b","isCorrect":false},{"text":"p","isCorrect":true}]},
    {"id":"LS06","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"net\"? 🥅","say":"Which letter makes the first sound in net? net.","options":[{"text":"n","isCorrect":true},{"text":"m","isCorrect":false},{"text":"h","isCorrect":false}]},
    {"id":"LS07","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"goat\"? 🐐","say":"Which letter makes the first sound in goat? goat.","options":[{"text":"q","isCorrect":false},{"text":"g","isCorrect":true},{"text":"j","isCorrect":false}]},
    {"id":"LS08","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"ink\"? 🖋️","say":"Which letter makes the first sound in ink? ink.","options":[{"text":"l","isCorrect":false},{"text":"j","isCorrect":false},{"text":"i","isCorrect":true}]},
    {"id":"LS09","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"hen\"? 🐔","say":"Which letter makes the first sound in hen? hen.","options":[{"text":"h","isCorrect":true},{"text":"n","isCorrect":false},{"text":"k","isCorrect":false}]},
    {"id":"LS10","skillAreaKey":"letterSounds","type":"choice","prompt":"Which letter makes the first sound in \"dog\"? 🐕","say":"Which letter makes the first sound in dog? dog.","options":[{"text":"b","isCorrect":false},{"text":"d","isCorrect":true},{"text":"p","isCorrect":false}]},
    {"id":"CV01","skillAreaKey":"wordReading","type":"mic","prompt":"Slide the sounds together and say it.","passage":"ma","expectedText":"ma","say":"Look at these two letters. Say the sounds and slide them together. Then tap the mic and say it."},
    {"id":"CV02","skillAreaKey":"wordReading","type":"mic","prompt":"Slide the sounds together and say it.","passage":"fe","expectedText":"fe"},
    {"id":"CV03","skillAreaKey":"wordReading","type":"mic","prompt":"Slide the sounds together and say it.","passage":"ti","expectedText":"ti"},
    {"id":"CV04","skillAreaKey":"wordReading","type":"mic","prompt":"Slide the sounds together and say it.","passage":"po","expectedText":"po"},
    {"id":"CV05","skillAreaKey":"wordReading","type":"mic","prompt":"Slide the sounds together and say it.","passage":"su","expectedText":"su"},
    {"id":"RW01","skillAreaKey":"wordReading","type":"mic","prompt":"Read this word out loud.","passage":"gap","expectedText":"gap","say":"Here are some words. Tap the mic and read each one out loud."},
    {"id":"RW02","skillAreaKey":"wordReading","type":"mic","prompt":"Read this word out loud.","passage":"den","expectedText":"den"},
    {"id":"RW03","skillAreaKey":"wordReading","type":"mic","prompt":"Read this word out loud.","passage":"rip","expectedText":"rip"},
    {"id":"RW04","skillAreaKey":"wordReading","type":"mic","prompt":"Read this word out loud.","passage":"jog","expectedText":"jog"},
    {"id":"RW05","skillAreaKey":"wordReading","type":"mic","prompt":"Read this word out loud.","passage":"bug","expectedText":"bug"},
    {"id":"NW01","skillAreaKey":"wordReading","type":"mic","prompt":"Read this made up word.","passage":"vap","expectedText":"vap","say":"These are made up words. They are not real words. Read them as best you can."},
    {"id":"NW02","skillAreaKey":"wordReading","type":"mic","prompt":"Read this made up word.","passage":"teg","expectedText":"teg"},
    {"id":"NW03","skillAreaKey":"wordReading","type":"mic","prompt":"Read this made up word.","passage":"nim","expectedText":"nim"},
    {"id":"NW04","skillAreaKey":"wordReading","type":"mic","prompt":"Read this made up word.","passage":"dob","expectedText":"dob"},
    {"id":"NW05","skillAreaKey":"wordReading","type":"mic","prompt":"Read this made up word.","passage":"fum","expectedText":"fum"},
    {"id":"HW01","skillAreaKey":"heartWords","type":"mic","prompt":"Read this word out loud.","passage":"the","expectedText":"the","say":"Here are some words you may know by heart. Read each one out loud."},
    {"id":"HW02","skillAreaKey":"heartWords","type":"mic","prompt":"Read this word out loud.","passage":"of","expectedText":"of"},
    {"id":"HW03","skillAreaKey":"heartWords","type":"mic","prompt":"Read this word out loud.","passage":"she","expectedText":"she"},
    {"id":"HW04","skillAreaKey":"heartWords","type":"mic","prompt":"Read this word out loud.","passage":"have","expectedText":"have"},
    {"id":"HW05","skillAreaKey":"heartWords","type":"mic","prompt":"Read this word out loud.","passage":"are","expectedText":"are"},
    {"id":"ST01","skillAreaKey":"storyReading","type":"mic","prompt":"Read this line of the story out loud.","passage":"Tim has a big red bag.","expectedText":"Tim has a big red bag.","say":"Here is a short story. It is called Tim and the pup. Read it out loud, one line at a time."},
    {"id":"ST02","skillAreaKey":"storyReading","type":"mic","prompt":"Read this line of the story out loud.","passage":"A pup hid in the bag.","expectedText":"A pup hid in the bag."},
    {"id":"ST03","skillAreaKey":"storyReading","type":"mic","prompt":"Read this line of the story out loud.","passage":"Tim said no to the pup.","expectedText":"Tim said no to the pup."},
    {"id":"ST04","skillAreaKey":"storyReading","type":"mic","prompt":"Read this line of the story out loud.","passage":"The pup did not go.","expectedText":"The pup did not go."},
    {"id":"ST05","skillAreaKey":"storyReading","type":"mic","prompt":"Read this line of the story out loud.","passage":"It sat on his leg.","expectedText":"It sat on his leg."},
    {"id":"ST06","skillAreaKey":"storyReading","type":"mic","prompt":"Read this line of the story out loud.","passage":"Tim and the pup sat in the sun.","expectedText":"Tim and the pup sat in the sun."},
    {"id":"ST07","skillAreaKey":"storyReading","type":"mic","prompt":"Read this line of the story out loud.","passage":"Now Tim is happy.","expectedText":"Now Tim is happy."},
    {"id":"ST08","skillAreaKey":"storyQuestions","type":"choice","prompt":"What does Tim have?","say":"What does Tim have? A big red bag, a hat, or a cup?","options":[{"text":"🎒 A big red bag","isCorrect":true},{"text":"🎩 A hat","isCorrect":false},{"text":"☕ A cup","isCorrect":false}]},
    {"id":"ST09","skillAreaKey":"storyQuestions","type":"choice","prompt":"Where did the pup hide?","say":"Where did the pup hide? Under the bed, in the bag, or up a tree?","options":[{"text":"🛏️ Under the bed","isCorrect":false},{"text":"👜 In the bag","isCorrect":true},{"text":"🌳 Up a tree","isCorrect":false}]},
    {"id":"ST10","skillAreaKey":"storyQuestions","type":"choice","prompt":"What did Tim say to the pup?","say":"What did Tim say to the pup? Hello, good night, or no?","options":[{"text":"👋 Hello","isCorrect":false},{"text":"🌙 Good night","isCorrect":false},{"text":"🙅 No","isCorrect":true}]},
    {"id":"ST11","skillAreaKey":"storyQuestions","type":"choice","prompt":"Where did the pup sit?","say":"Where did the pup sit? On his leg, on the bus, or on the bed?","options":[{"text":"🦵 On his leg","isCorrect":true},{"text":"🚌 On the bus","isCorrect":false},{"text":"🛏️ On the bed","isCorrect":false}]},
    {"id":"ST12","skillAreaKey":"storyQuestions","type":"choice","prompt":"Why do you think Tim is happy at the end?","say":"Why do you think Tim is happy at the end? He lost his bag, he has a new friend, or it is raining?","options":[{"text":"🎒 He lost his bag","isCorrect":false},{"text":"🐶 He has a new friend","isCorrect":true},{"text":"🌧️ It is raining","isCorrect":false}]},
    {"id":"AT01","skillAreaKey":"readingAttitude","type":"choice","prompt":"How do you feel when someone reads a story to you?","say":"There are no right or wrong answers. How do you feel when someone reads a story to you? Happy, Just okay, Sad?","options":[{"text":"😀 Happy","isCorrect":true},{"text":"😐 Just okay","isCorrect":true},{"text":"😢 Sad","isCorrect":true}]},
    {"id":"AT02","skillAreaKey":"readingAttitude","type":"choice","prompt":"How do you feel when you look at books by yourself?","say":"How do you feel when you look at books by yourself? Happy, Just okay, Sad?","options":[{"text":"😀 Happy","isCorrect":true},{"text":"😐 Just okay","isCorrect":true},{"text":"😢 Sad","isCorrect":true}]},
    {"id":"AT03","skillAreaKey":"readingAttitude","type":"choice","prompt":"How do you feel about learning to read?","say":"How do you feel about learning to read? Happy, Just okay, Sad?","options":[{"text":"😀 Happy","isCorrect":true},{"text":"😐 Just okay","isCorrect":true},{"text":"😢 Sad","isCorrect":true}]},
    {"id":"AT04","skillAreaKey":"readingAttitude","type":"choice","prompt":"Does someone at home read or tell stories with you?","say":"Does someone at home read or tell stories with you? Yes, Sometimes, No?","options":[{"text":"👍 Yes","isCorrect":true},{"text":"🙂 Sometimes","isCorrect":true},{"text":"👎 No","isCorrect":true}]},
    {"id":"WT01","skillAreaKey":"writing","type":"text","prompt":"Write your name.","say":"Write your name."},
    {"id":"WT02","skillAreaKey":"writing","type":"text","prompt":"Write the letter for the first sound you hear.","say":"Write the letter for the first sound in sun. sun.","expectedText":"s"},
    {"id":"WT03","skillAreaKey":"writing","type":"text","prompt":"Write the letter for the first sound you hear.","say":"Write the letter for the first sound in mango. mango.","expectedText":"m"},
    {"id":"WT04","skillAreaKey":"writing","type":"text","prompt":"Write the letter for the first sound you hear.","say":"Write the letter for the first sound in tap. tap.","expectedText":"t"},
    {"id":"WT05","skillAreaKey":"writing","type":"text","prompt":"Write the letter for the first sound you hear.","say":"Write the letter for the first sound in ball. ball.","expectedText":"b"},
    {"id":"WT06","skillAreaKey":"writing","type":"text","prompt":"Write the letter for the first sound you hear.","say":"Write the letter for the first sound in ink. ink.","expectedText":"i"},
    {"id":"WT07","skillAreaKey":"writing","type":"text","prompt":"Write the word you hear.","say":"Write the word tag. The shirt has a tag. tag.","expectedText":"tag"},
    {"id":"WT08","skillAreaKey":"writing","type":"text","prompt":"Write the word you hear.","say":"Write the word peg. Hang the cloth with a peg. peg.","expectedText":"peg"},
    {"id":"WT09","skillAreaKey":"writing","type":"text","prompt":"Write the word you hear.","say":"Write the word job. My mother has a job. job.","expectedText":"job"},
    {"id":"WT10","skillAreaKey":"writing","type":"text","prompt":"Write the word you hear.","say":"Write the word bun. I ate a bun. bun.","expectedText":"bun"},
    {"id":"WT11","skillAreaKey":"writing","type":"text","prompt":"Write the sentence you hear.","say":"Write this sentence. The red bus is big. The... red... bus... is... big. The red bus is big.","expectedText":"The red bus is big."}
  ]'::jsonb, true
where not exists (select 1 from public.assessments where level = 1 and form = 'A' and delivery = 'game');

notify pgrst, 'reload schema';
