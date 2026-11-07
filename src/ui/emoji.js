
/**
 * @file Emoji dataset and pure helper functions for the Chirp Messenger UI.
 *
 * This module is deliberately self-contained:
 *   - no imports at all (not even from the rest of the project),
 *   - no DOM access,
 *   - the only browser API touched is `localStorage`, and every access to it is
 *     wrapped in `try/catch`, so importing this file never throws.
 *
 * The composer emoji picker and the message quick-reaction bar both render
 * from the data exported here.
 *
 * @module ui/emoji
 */

/**
 * A single emoji entry.
 *
 * @typedef {Object} EmojiItem
 * @property {string} emoji The unicode emoji itself. May be a multi code point
 *   sequence (ZWJ sequences, variation selectors, regional indicator pairs).
 * @property {string} name Human readable name, e.g. `grinning face`.
 * @property {string} keywords Space separated synonyms used by
 *   {@link searchEmoji} to match free text queries.
 */

/**
 * A group of emoji entries, rendered as a single tab in the picker.
 *
 * @typedef {Object} EmojiCategory
 * @property {string} id Stable machine readable identifier.
 * @property {string} name Human readable tab label.
 * @property {string} icon The emoji shown on the tab itself.
 * @property {EmojiItem[]} items The emoji belonging to this category.
 */

/**
 * The full emoji dataset, in the order the tabs are rendered.
 *
 * The `recent` category intentionally ships with an empty `items` array: its
 * contents are populated at runtime from `localStorage` by the UI.
 *
 * @type {EmojiCategory[]}
 */
export const EMOJI_CATEGORIES = [
  {
    id: 'recent',
    name: 'Recently Used',
    icon: '🕘',
    items: [],
  },
  {
    id: 'smileys',
    name: 'Smileys & People',
    icon: '😀',
    items: [
      { emoji: '😃', name: 'grinning face with big eyes', keywords: 'smile happy grin face' },
      { emoji: '😄', name: 'grinning face with smiling eyes', keywords: 'smile happy joy face' },
      { emoji: '😁', name: 'beaming face with smiling eyes', keywords: 'smile happy grin teeth' },
      { emoji: '😆', name: 'grinning squinting face', keywords: 'smile happy laugh haha' },
      { emoji: '😅', name: 'grinning face with sweat', keywords: 'smile nervous relief laugh' },
      { emoji: '🤣', name: 'rolling on the floor laughing', keywords: 'lol rofl laugh funny' },
      { emoji: '😂', name: 'face with tears of joy', keywords: 'lol laugh cry funny' },
      { emoji: '🙂', name: 'slightly smiling face', keywords: 'smile mild calm' },
      { emoji: '🙃', name: 'upside-down face', keywords: 'silly sarcasm' },
      { emoji: '😉', name: 'winking face', keywords: 'wink flirt joke smile' },
      { emoji: '😊', name: 'smiling face with smiling eyes', keywords: 'smile blush happy' },
      { emoji: '😇', name: 'smiling face with halo', keywords: 'angel innocent smile' },
      { emoji: '🥰', name: 'smiling face with hearts', keywords: 'love adore crush smile' },
      { emoji: '😍', name: 'smiling face with heart-eyes', keywords: 'love crush adore heart' },
      { emoji: '🤩', name: 'star-struck face', keywords: 'excited wow amazed' },
      { emoji: '😘', name: 'face blowing a kiss', keywords: 'kiss love flirt' },
      { emoji: '😚', name: 'kissing face with closed eyes', keywords: 'kiss love' },
      { emoji: '😙', name: 'kissing face with smiling eyes', keywords: 'kiss smile' },
      { emoji: '😋', name: 'face savoring food', keywords: 'yum tasty delicious smile' },
      { emoji: '😛', name: 'face with tongue', keywords: 'silly playful tongue' },
      { emoji: '😜', name: 'winking face with tongue', keywords: 'crazy silly joke' },
      { emoji: '🤪', name: 'zany face', keywords: 'crazy goofy wild' },
      { emoji: '😝', name: 'squinting face with tongue', keywords: 'silly gross crazy' },
      { emoji: '🤑', name: 'money-mouth face', keywords: 'rich money greedy' },
      { emoji: '🤗', name: 'hugging face', keywords: 'hug warm embrace' },
      { emoji: '🤭', name: 'face with hand over mouth', keywords: 'giggle oops secret' },
      { emoji: '🤫', name: 'shushing face', keywords: 'quiet secret shush' },
      { emoji: '🤔', name: 'thinking face', keywords: 'think hmm consider' },
      { emoji: '🤐', name: 'zippered-mouth face', keywords: 'quiet secret sealed' },
      { emoji: '🤨', name: 'face with raised eyebrow', keywords: 'skeptical suspicious doubt' },
      { emoji: '😑', name: 'expressionless face', keywords: 'blank meh deadpan' },
      { emoji: '😶', name: 'face without mouth', keywords: 'speechless silent quiet' },
      { emoji: '😏', name: 'smirking face', keywords: 'smug flirt sly' },
      { emoji: '😒', name: 'unamused face', keywords: 'annoyed bored meh' },
      { emoji: '🙄', name: 'face with rolling eyes', keywords: 'annoyed eye roll whatever' },
      { emoji: '😬', name: 'grimacing face', keywords: 'awkward nervous eek' },
      { emoji: '😌', name: 'relieved face', keywords: 'relaxed calm peaceful' },
      { emoji: '😔', name: 'pensive face', keywords: 'sad wistful melancholy' },
      { emoji: '😴', name: 'sleeping face', keywords: 'sleep zzz tired' },
      { emoji: '😷', name: 'face with medical mask', keywords: 'sick mask doctor' },
      { emoji: '🤒', name: 'face with thermometer', keywords: 'sick fever ill' },
      { emoji: '🤧', name: 'sneezing face', keywords: 'sick sneeze allergy' },
      { emoji: '🥵', name: 'hot face', keywords: 'heat sweating hot' },
      { emoji: '🥶', name: 'cold face', keywords: 'freezing cold ice' },
      { emoji: '🤯', name: 'exploding head', keywords: 'mind blown shock amazing' },
      { emoji: '🤠', name: 'cowboy hat face', keywords: 'cowboy western yeehaw' },
      { emoji: '🥳', name: 'partying face', keywords: 'party celebrate birthday' },
      { emoji: '😎', name: 'smiling face with sunglasses', keywords: 'cool sunglasses deal' },
      { emoji: '🤓', name: 'nerd face', keywords: 'nerd glasses study' },
      { emoji: '😕', name: 'confused face', keywords: 'confused unsure puzzled' },
      { emoji: '😟', name: 'worried face', keywords: 'worried anxious concerned' },
      { emoji: '🙁', name: 'slightly frowning face', keywords: 'sad frown down' },
      { emoji: '☹️', name: 'frowning face', keywords: 'sad frown displeased' },
      { emoji: '😮', name: 'face with open mouth', keywords: 'surprise wow astonished' },
      { emoji: '😯', name: 'hushed face', keywords: 'surprise quiet shocked' },
      { emoji: '😲', name: 'astonished face', keywords: 'shocked amazed amazing' },
      { emoji: '😳', name: 'flushed face', keywords: 'embarrassed blushing shy' },
      { emoji: '🥺', name: 'pleading face', keywords: 'beg puppy eyes please' },
      { emoji: '😨', name: 'fearful face', keywords: 'scared afraid fear' },
      { emoji: '😰', name: 'anxious face with sweat', keywords: 'nervous scared sweat' },
      { emoji: '😥', name: 'sad but relieved face', keywords: 'phew relieved sigh' },
      { emoji: '😢', name: 'crying face', keywords: 'sad tear cry' },
      { emoji: '😭', name: 'loudly crying face', keywords: 'sob cry sad' },
      { emoji: '😱', name: 'face screaming in fear', keywords: 'scream shock horror' },
      { emoji: '😣', name: 'persevering face', keywords: 'effort struggle' },
      { emoji: '😞', name: 'disappointed face', keywords: 'sad disappointed let down' },
      { emoji: '😓', name: 'downcast face with sweat', keywords: 'tired stress exhausted' },
      { emoji: '😩', name: 'weary face', keywords: 'exhausted weary tired' },
      { emoji: '😤', name: 'face with steam from nose', keywords: 'determined huff triumph' },
      { emoji: '😡', name: 'pouting face', keywords: 'angry rage mad' },
      {emoji: '😠', name: 'angry face', keywords: 'angry mad cross' },
      { emoji: '🤬', name: 'face with symbols on mouth', keywords: 'swearing angry cursing' },
      { emoji: '😈', name: 'smiling face with horns', keywords: 'devil evil mischief' },
      { emoji: '👿', name: 'angry face with horns', keywords: 'devil imp evil' },
      { emoji: '💀', name: 'skull', keywords: 'dead skeleton death' },
      { emoji: '💩', name: 'pile of poo', keywords: 'poop dung funny' },
      { emoji: '🤡', name: 'clown face', keywords: 'clown joker circus' },
      { emoji: '👹', name: 'ogre', keywords: 'monster japanese' },
      { emoji: '👻', name: 'ghost', keywords: 'halloween spooky phantom' },
      { emoji: '👽', name: 'alien', keywords: 'ufo extraterrestrial space' },
      { emoji: '🤖', name: 'robot face', keywords: 'bot machine ai' },
    ],
  },
  {
    id: 'animals',
    name: 'Animals & Nature',
    icon: '🐻',
    items: [
      { emoji: '🐶', name: 'dog face', keywords: 'dog puppy pet animal' },
      { emoji: '🐱', name: 'cat face', keywords: 'cat kitten pet animal' },
      { emoji: '🐭', name: 'mouse face', keywords: 'mouse rodent animal' },
      { emoji: '🐰', name: 'rabbit face', keywords: 'rabbit bunny hare animal' },
      { emoji: '🦊', name: 'fox', keywords: 'fox animal' },
      { emoji: '🐨', name: 'koala face', keywords: 'koala animal' },
      { emoji: '🐼', name: 'panda face', keywords: 'panda animal' },
      { emoji: '🐯', name: 'tiger face', keywords: 'tiger animal' },
      { emoji: '🦁', name: 'lion face', keywords: 'lion animal' },
      { emoji: '🐮', name: 'cow face', keywords: 'cow cattle animal' },
      { emoji: '🐷', name: 'pig face', keywords: 'pig animal' },
      { emoji: '🐸', name: 'frog', keywords: 'frog animal' },
      { emoji: '🐵', name: 'monkey face', keywords: 'monkey animal' },
      { emoji: '🐔', name: 'chicken', keywords: 'chicken hen farm' },
      { emoji: '🐧', name: 'penguin', keywords: 'penguin bird ice' },
      { emoji: '🐦', name: 'bird', keywords: 'bird tweet' },
      { emoji: '🐤', name: 'baby chick', keywords: 'chick baby bird' },
      { emoji: '🦆', name: 'duck', keywords: 'duck bird pond' },
      { emoji: '🦅', name: 'eagle', keywords: 'eagle bird' },
      { emoji: '🦉', name: 'owl', keywords: 'owl night bird' },
      { emoji: '🐺', name: 'wolf', keywords: 'wolf animal howl' },
      { emoji: '🐗', name: 'boar', keywords: 'boar wild pig' },
      { emoji: '🐴', name: 'horse face', keywords: 'horse animal' },
      { emoji: '🦄', name: 'unicorn', keywords: 'unicorn magic fantasy' },
      { emoji: '🐝', name: 'honeybee', keywords: 'bee honey insect' },
      { emoji: '🦋', name: 'butterfly', keywords: 'butterfly insect' },
      { emoji: '🐌', name: 'snail', keywords: 'snail slow' },
      { emoji: '🐞', name: 'lady beetle', keywords: 'ladybug beetle insect' },
      { emoji: '🐜', name: 'ant', keywords: 'ant insect' },
      { emoji: '🕷️', name: 'spider', keywords: 'spider web halloween' },
      { emoji: '🐢', name: 'turtle', keywords: 'turtle slow' },
      { emoji: '🐍', name: 'snake', keywords: 'snake serpent' },
      { emoji: '🐙', name: 'octopus', keywords: 'octopus sea' },
      { emoji: '🦑', name: 'squid', keywords: 'squid sea' },
      { emoji: '🦀', name: 'crab', keywords: 'crab sea' },
      { emoji: '🐠', name: 'tropical fish', keywords: 'fish sea reef' },
      { emoji: '🐟', name: 'fish', keywords: 'fish sea' },
      { emoji: '🐬', name: 'dolphin', keywords: 'dolphin sea' },
      { emoji: '🐳', name: 'spouting whale', keywords: 'whale ocean' },
      { emoji: '🦈', name: 'shark', keywords: 'shark sea' },
      { emoji: '🐊', name: 'crocodile', keywords: 'crocodile reptile' },
      { emoji: '🐘', name: 'elephant', keywords: 'elephant animal' },
      { emoji: '🦏', name: 'rhinoceros', keywords: 'rhino animal' },
      { emoji: '🦒', name: 'giraffe', keywords: 'giraffe animal' },
      { emoji: '🦓', name: 'zebra', keywords: 'zebra animal' },
      { emoji: '🦘', name: 'kangaroo', keywords: 'kangaroo animal' },
      { emoji: '🦙', name: 'llama', keywords: 'llama animal' },
      { emoji: '🐐', name: 'goat', keywords: 'goat animal' },
      { emoji: '🐑', name: 'sheep', keywords: 'sheep lamb animal' },
      { emoji: '🌵', name: 'cactus', keywords: 'cactus plant desert' },
      { emoji: '🌳', name: 'deciduous tree', keywords: 'tree forest' },
      { emoji: '🌴', name: 'palm tree', keywords: 'palm beach tree' },
      { emoji: '🌱', name: 'seedling', keywords: 'sprout plant grow' },
      { emoji: '🌿', name: 'herb', keywords: 'leaf plant green' },
      { emoji: '🍀', name: 'four leaf clover', keywords: 'clover luck irish' },
      { emoji: '🍁', name: 'maple leaf', keywords: 'autumn leaf canada' },
      { emoji: '🌻', name: 'sunflower', keywords: 'flower sun' },
      { emoji: '🌹', name: 'rose', keywords: 'flower love' },
      { emoji: '🌷', name: 'tulip', keywords: 'flower' },
      { emoji: '💐', name: 'bouquet', keywords: 'flowers gift' },
      { emoji: '🌸', name: 'cherry blossom', keywords: 'sakura spring flower' },
      { emoji: '🍄', name: 'mushroom', keywords: 'mushroom fungus' },
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: '🍎',
    items: [
      { emoji: '🍐', name: 'pear', keywords: 'pear fruit' },
      { emoji: '🍊', name: 'tangerine', keywords: 'orange tangerine citrus' },
      { emoji: '🍋', name: 'lemon', keywords: 'lemon citrus sour' },
      { emoji: '🍌', name: 'banana', keywords: 'banana fruit' },
      { emoji: '🍉', name: 'watermelon', keywords: 'watermelon melon fruit' },
      { emoji: '🍇', name: 'grapes', keywords: 'grapes fruit wine' },
      { emoji: '🍓', name: 'strawberry', keywords: 'strawberry fruit berry' },
      { emoji: '🍒', name: 'cherries', keywords: 'cherry fruit' },
      { emoji: '🍑', name: 'peach', keywords: 'peach fruit' },
      { emoji: '🥭', name: 'mango', keywords: 'mango fruit tropical' },
      { emoji: '🍍', name: 'pineapple', keywords: 'pineapple fruit tropical' },
      { emoji: '🍅', name: 'tomato', keywords: 'tomato fruit vegetable' },
      { emoji: '🍆', name: 'eggplant', keywords: 'eggplant aubergine vegetable' },
      { emoji: '🥑', name: 'avocado', keywords: 'avocado toast fruit' },
      { emoji: '🥦', name: 'broccoli', keywords: 'broccoli vegetable green' },
      { emoji: '🌶️', name: 'hot pepper', keywords: 'spicy chili pepper hot' },
      { emoji: '🫑', name: 'bell pepper', keywords: 'capsicum pepper vegetable' },
      { emoji: '🌽', name: 'corn', keywords: 'corn maize vegetable' },
      { emoji: '🥕', name: 'carrot', keywords: 'carrot vegetable' },
      { emoji: '🥔', name: 'potato', keywords: 'potato vegetable' },
      { emoji: '🥐', name: 'croissant', keywords: 'croissant pastry french' },
      { emoji: '🥯', name: 'bagel', keywords: 'bagel bread' },
      { emoji: '🍞', name: 'bread', keywords: 'bread loaf' },
      { emoji: '🧀', name: 'cheese', keywords: 'cheese dairy' },
      { emoji: '🥚', name: 'egg', keywords: 'egg breakfast' },
      { emoji: '🍳', name: 'cooking', keywords: 'fried egg breakfast cooking' },
      { emoji: '🥞', name: 'pancakes', keywords: 'pancake breakfast stack' },
      { emoji: '🥓', name: 'bacon', keywords: 'bacon breakfast meat' },
      { emoji: '🍔', name: 'hamburger', keywords: 'burger fast food' },
      { emoji: '🍟', name: 'french fries', keywords: 'fries chips fast food' },
      { emoji: '🍕', name: 'pizza', keywords: 'pizza slice italian' },
      { emoji: '🌭', name: 'hot dog', keywords: 'hotdog fast food' },
      { emoji: '🥪', name: 'sandwich', keywords: 'sandwich lunch' },
      { emoji: '🌮', name: 'taco', keywords: 'taco mexican' },
      { emoji: '🌯', name: 'burrito', keywords: 'burrito mexican wrap' },
      { emoji: '🍝', name: 'spaghetti', keywords: 'pasta noodles italian' },
      { emoji: '🍜', name: 'steaming bowl', keywords: 'ramen noodles soup' },
      { emoji: '🍲', name: 'pot of food', keywords: 'stew soup dinner' },
      { emoji: '🍣', name: 'sushi', keywords: 'sushi japanese fish' },
      { emoji: '🍚', name: 'rice', keywords: 'rice bowl grain' },
      { emoji: '🍦', name: 'soft ice cream', keywords: 'ice cream dessert' },
      { emoji: '🍩', name: 'doughnut', keywords: 'donut doughnut sweet' },
      { emoji: '🍪', name: 'cookie', keywords: 'cookie biscuit sweet' },
      { emoji: '🎂', name: 'birthday cake', keywords: 'cake birthday party' },
      { emoji: '🍰', name: 'shortcake', keywords: 'cake slice dessert' },
      { emoji: '🧁', name: 'cupcake', keywords: 'cupcake dessert' },
      { emoji: '🍫', name: 'chocolate bar', keywords: 'chocolate sweet candy' },
      { emoji: '🍬', name: 'candy', keywords: 'candy sweet treat' },
      { emoji: '🍭', name: 'lollipop', keywords: 'lollipop sweet candy' },
      { emoji: '🍯', name: 'honey pot', keywords: 'honey sweet bee' },
      { emoji: '☕', name: 'hot beverage', keywords: 'coffee tea drink' },
      { emoji: '🧃', name: 'beverage box', keywords: 'juice box drink' },
      { emoji: '🥤', name: 'cup with straw', keywords: 'soda drink fast food' },
      { emoji: '🍺', name: 'beer mug', keywords: 'beer drink pub' },
      { emoji: '🍻', name: 'clinking beer mugs', keywords: 'beer cheers drink' },
      { emoji: '🥂', name: 'clinking glasses', keywords: 'cheers toast celebration' },
      { emoji: '🍷', name: 'wine glass', keywords: 'wine drink' },
      { emoji: '🥃', name: 'tumbler glass', keywords: 'whisky cocktail drink' },
      { emoji: '🍸', name: 'cocktail glass', keywords: 'cocktail martini drink' },
      { emoji: '🍹', name: 'tropical drink', keywords: 'cocktail holiday drink' },
    ],
  },
  {
    id: 'activity',
    name: 'Activities',
    icon: '🏆',
    items: [
      { emoji: '⚽', name: 'soccer ball', keywords: 'soccer football sport' },
      { emoji: '🏀', name: 'basketball', keywords: 'basketball sport hoop' },
      { emoji: '🏈', name: 'football', keywords: 'american football sport' },
      { emoji: '⚾', name: 'baseball', keywords: 'baseball sport' },
      { emoji: '🥎', name: 'softball', keywords: 'softball sport' },
      { emoji: '🏐', name: 'volleyball', keywords: 'volleyball sport' },
      { emoji: '🏉', name: 'rugby football', keywords: 'rugby sport' },
      { emoji: '🎾', name: 'tennis', keywords: 'tennis racket sport' },
      { emoji: '🏸', name: 'badminton', keywords: 'badminton shuttlecock sport' },
      { emoji: '🏓', name: 'ping pong', keywords: 'table tennis paddle sport' },
      { emoji: '🏑', name: 'field hockey', keywords: 'hockey stick sport' },
      { emoji: '🥍', name: 'lacrosse', keywords: 'lacrosse stick sport' },
      { emoji: '🏒', name: 'hockey', keywords: 'ice hockey stick sport' },
      { emoji: '⛳', name: 'flag in hole', keywords: 'golf hole sport' },
      { emoji: '🏹', name: 'bow and arrow', keywords: 'archery arrow sport' },
      { emoji: '🎣', name: 'fishing pole', keywords: 'fishing fish hobby' },
      { emoji: '🥊', name: 'boxing glove', keywords: 'boxing fight sport' },
      { emoji: '🥋', name: 'martial arts uniform', keywords: 'karate judo martial arts' },
      { emoji: '🎽', name: 'running shirt', keywords: 'running marathon sport' },
      { emoji: '🛹', name: 'skateboard', keywords: 'skateboard skate' },
      { emoji: '🛼', name: 'roller skate', keywords: 'roller skating' },
      { emoji: '🛷', name: 'sled', keywords: 'sled snow' },
      { emoji: '⛸️', name: 'ice skate', keywords: 'ice skating' },
      { emoji: '🎿', name: 'ski', keywords: 'skiing snow' },
      { emoji: '🏂', name: 'snowboarder', keywords: 'snowboard snow winter' },
      { emoji: '⛷️', name: 'skier', keywords: 'skiing snow winter' },
      { emoji: '🏄', name: 'surfer', keywords: 'surfing beach wave' },
      { emoji: '🏊', name: 'swimmer', keywords: 'swimming pool swim' },
      { emoji: '🤿', name: 'diving mask', keywords: 'diving scuba snorkel' },
      { emoji: '🚴', name: 'cyclist', keywords: 'cycling bike ride' },
      { emoji: '🏋️', name: 'person lifting weights', keywords: 'gym workout weightlifting' },
      { emoji: '🤼', name: 'person wrestling', keywords: 'wrestling sport' },
      { emoji: '🤸', name: 'person cartwheeling', keywords: 'gymnastics acrobat' },
      { emoji: '🏌️', name: 'person golfing', keywords: 'golfing golf' },
      { emoji: '🧗', name: 'person climbing', keywords: 'climbing rock' },
      { emoji: '🏃', name: 'person running', keywords: 'running jog marathon' },
      { emoji: '💃', name: 'dancer', keywords: 'dancing dance' },
      { emoji: '🕺', name: 'man dancing', keywords: 'dancing dance' },
      { emoji: '🧘', name: 'person in lotus position', keywords: 'yoga meditation zen' },
      { emoji: '🎯', name: 'bullseye', keywords: 'target darts aim' },
      { emoji: '🎳', name: 'bowling', keywords: 'bowling ball strike' },
      { emoji: '🎮', name: 'video game', keywords: 'gaming controller console' },
      { emoji: '🕹️', name: 'joystick', keywords: 'joystick arcade gaming' },
      { emoji: '🎲', name: 'game die', keywords: 'dice random game' },
      { emoji: '🧩', name: 'puzzle piece', keywords: 'puzzle jigsaw' },
      { emoji: '🥇', name: 'gold medal', keywords: 'gold first place win' },
      { emoji: '🥈', name: 'silver medal', keywords: 'silver second place' },
      { emoji: '🥉', name: 'bronze medal', keywords: 'bronze third place' },
      { emoji: '🎨', name: 'artist palette', keywords: 'art paint design' },
      { emoji: '🎭', name: 'performing arts', keywords: 'theatre drama acting' },
      { emoji: '🎬', name: 'clapper board', keywords: 'movie film action' },
      { emoji: '🎤', name: 'microphone', keywords: 'sing karaoke mic' },
      { emoji: '🎧', name: 'headphone', keywords: 'headphones music listen' },
      { emoji: '🎸', name: 'guitar', keywords: 'music rock guitar' },
      { emoji: '🥁', name: 'drum', keywords: 'music drum beat' },
      { emoji: '🎺', name: 'trumpet', keywords: 'music brass horn' },
      { emoji: '🎻', name: 'violin', keywords: 'music strings fiddle' },
      { emoji: '🎪', name: 'circus tent', keywords: 'circus carnival' },
      { emoji: '🎠', name: 'carousel horse', keywords: 'carousel fair ride' },
      { emoji: '🎡', name: 'ferris wheel', keywords: 'fair ride amusement' },
      { emoji: '🎢', name: 'roller coaster', keywords: 'amusement park thrill' },
      { emoji: '🎫', name: 'ticket', keywords: 'ticket admission show' },
      { emoji: '🎟️', name: 'admission tickets', keywords: 'ticket cinema show' },
      { emoji: '🎗️', name: 'reminder ribbon', keywords: 'ribbon awareness' },
    ],
  },
  {
    id: 'travel',
    name: 'Travel & Places',
    icon: '✈️',
    items: [
      { emoji: '🚗', name: 'automobile', keywords: 'car drive vehicle' },
      { emoji: '🚕', name: 'taxi', keywords: 'taxi cab ride' },
      { emoji: '🚙', name: 'sport utility vehicle', keywords: 'suv car' },
      { emoji: '🚌', name: 'bus', keywords: 'bus transit' },
      { emoji: '🏎️', name: 'racing car', keywords: 'racing fast car' },
      { emoji: '🚓', name: 'police car', keywords: 'police cop' },
      { emoji: '🚑', name: 'ambulance', keywords: 'ambulance emergency' },
      { emoji: '🚒', name: 'fire engine', keywords: 'fire truck firefighter' },
      { emoji: '🚚', name: 'delivery truck', keywords: 'truck delivery shipping' },
      { emoji: '🚲', name: 'bicycle', keywords: 'bike bicycle cycle' },
      { emoji: '🛵', name: 'motor scooter', keywords: 'motorbike scooter' },
      { emoji: '🏍️', name: 'motorcycle', keywords: 'motorbike motorcycle' },
      { emoji: '🚨', name: 'oncoming police car', keywords: 'siren police alert' },
      { emoji: '🚦', name: 'vertical traffic light', keywords: 'traffic light signal' },
      { emoji: '🚥', name: 'horizontal traffic light', keywords: 'traffic light signal' },
      { emoji: '🛑', name: 'stop sign', keywords: 'stop halt' },
      { emoji: '⚓', name: 'anchor', keywords: 'anchor sea port' },
      { emoji: '⛵', name: 'sailboat', keywords: 'sailboat yacht sea' },
      { emoji: '🛳️', name: 'passenger ship', keywords: 'cruise ship sea' },
      { emoji: '🚢', name: 'ship', keywords: 'ship boat sea' },
      { emoji: '🛩️', name: 'small airplane', keywords: 'plane flight travel' },
      { emoji: '🚀', name: 'rocket', keywords: 'rocket space launch' },
      { emoji: '🚁', name: 'helicopter', keywords: 'helicopter flight' },
      { emoji: '🗺️', name: 'world map', keywords: 'map travel geography' },
      { emoji: '🧭', name: 'compass', keywords: 'compass direction navigation' },
      { emoji: '🏰', name: 'castle', keywords: 'castle fairy tale' },
      { emoji: '🏟️', name: 'stadium', keywords: 'stadium arena sport' },
      { emoji: '⛩️', name: 'shinto shrine', keywords: 'shrine japan torii' },
      { emoji: '🕌', name: 'mosque', keywords: 'mosque islam' },
      { emoji: '🕍', name: 'synagogue', keywords: 'synagogue jewish' },
      { emoji: '⛪', name: 'church', keywords: 'church christian' },
      { emoji: '🌋', name: 'volcano', keywords: 'volcano lava eruption' },
      { emoji: '🏝️', name: 'desert island', keywords: 'island beach tropical' },
      { emoji: '🏜️', name: 'desert', keywords: 'desert sand dunes' },
      { emoji: '🏖️', name: 'beach with umbrella', keywords: 'beach holiday sea' },
      { emoji: '🏕️', name: 'camping', keywords: 'camping tent outdoors' },
      { emoji: '⛺', name: 'tent', keywords: 'tent camping' },
      { emoji: '🏠', name: 'house', keywords: 'house home building' },
      { emoji: '🏡', name: 'house with garden', keywords: 'home yard' },
      { emoji: '🏢', name: 'office building', keywords: 'office work building' },
      { emoji: '🏣', name: 'post office', keywords: 'post office mail' },
      { emoji: '🏥', name: 'hospital', keywords: 'hospital health' },
      { emoji: '🏦', name: 'bank', keywords: 'bank money' },
      { emoji: '🏨', name: 'hotel', keywords: 'hotel accommodation' },
      { emoji: '🏪', name: 'convenience store', keywords: 'store shop' },
      { emoji: '🏫', name: 'school', keywords: 'school education' },
      { emoji: '🏭', name: 'factory', keywords: 'factory industry' },
      { emoji: '🏗️', name: 'building construction', keywords: 'construction crane building' },
      { emoji: '🏘️', name: 'houses', keywords: 'neighborhood houses' },
      { emoji: '🏙️', name: 'cityscape', keywords: 'city skyline urban' },
      { emoji: '🌃', name: 'night with stars', keywords: 'night city sky' },
      { emoji: '🌉', name: 'bridge at night', keywords: 'bridge night city' },
      { emoji: '🏔️', name: 'snow-capped mountain', keywords: 'mountain peak nature' },
      { emoji: '🌄', name: 'sunrise over mountains', keywords: 'sunrise morning mountains' },
      { emoji: '🌇', name: 'cityscape at dusk', keywords: 'sunset dusk city' },
      { emoji: '🌆', name: 'night city', keywords: 'city night lights' },
      { emoji: '🛣️', name: 'motorway', keywords: 'highway road' },
      { emoji: '🛤️', name: 'railway track', keywords: 'railway train tracks' },
      { emoji: '🚏', name: 'bus stop', keywords: 'bus stop sign' },
      { emoji: '🛬', name: 'airplane departure', keywords: 'flight departure travel' },
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: '💡',
    items: [
      { emoji: '⌚', name: 'wrist watch', keywords: 'watch time clock' },
      { emoji: '📱', name: 'mobile phone', keywords: 'phone smartphone mobile' },
      { emoji: '💻', name: 'laptop', keywords: 'laptop computer' },
      { emoji: '🖥️', name: 'desktop computer', keywords: 'computer monitor desktop' },
      { emoji: '⌨️', name: 'keyboard', keywords: 'keyboard typing' },
      { emoji: '🖨️', name: 'printer', keywords: 'printer print office' },
      { emoji: '🖱️', name: 'computer mouse', keywords: 'mouse click' },
      { emoji: '💵', name: 'dollar banknote', keywords: 'money cash dollar' },
      { emoji: '💰', name: 'money bag', keywords: 'money rich cash' },
      { emoji: '💳', name: 'credit card', keywords: 'payment card money' },
      { emoji: '💸', name: 'money with wings', keywords: 'money expensive waste' },
      { emoji: '🧾', name: 'receipt', keywords: 'receipt invoice paper' },
      { emoji: '💎', name: 'gem stone', keywords: 'diamond jewel gem' },
      { emoji: '⚙️', name: 'gear', keywords: 'settings cog gear' },
      { emoji: '🔬', name: 'microscope', keywords: 'science lab microscope' },
      { emoji: '🔭', name: 'telescope', keywords: 'space science telescope' },
      { emoji: '🧪', name: 'test tube', keywords: 'science lab experiment' },
      { emoji: '🧽', name: 'sponge', keywords: 'sponge clean' },
      { emoji: '🔦', name: 'flashlight', keywords: 'torch flashlight light' },
      { emoji: '🕯️', name: 'candle', keywords: 'candle flame light' },
      { emoji: '🔋', name: 'battery', keywords: 'battery power charge' },
      { emoji: '🔌', name: 'plug', keywords: 'plug power outlet' },
      { emoji: '📷', name: 'camera', keywords: 'photo camera picture' },
      { emoji: '📹', name: 'video camera', keywords: 'video record camera' },
      { emoji: '🎥', name: 'movie camera', keywords: 'film movie cinema' },
      { emoji: '📞', name: 'telephone receiver', keywords: 'phone call receive' },
      { emoji: '☎️', name: 'telephone', keywords: 'phone landline call' },
      { emoji: '📺', name: 'television', keywords: 'tv television screen' },
      { emoji: '📻', name: 'radio', keywords: 'radio broadcast' },
      { emoji: '🎙️', name: 'microphone', keywords: 'podcast audio mic' },
      { emoji: '⏱️', name: 'stopwatch', keywords: 'stopwatch timer speed' },
      { emoji: '⏲️', name: 'alarm clock', keywords: 'alarm clock time' },
      { emoji: '⌛', name: 'hourglass', keywords: 'hourglass sand time' },
      { emoji: '📔', name: 'notebook with decorative cover', keywords: 'notebook journal' },
      { emoji: '📕', name: 'closed book', keywords: 'book reading' },
      { emoji: '📚', name: 'books', keywords: 'books library reading' },
      { emoji: '📄', name: 'page facing up', keywords: 'document paper page' },
      { emoji: '🗒️', name: 'spiral notepad', keywords: 'notepad notes' },
      { emoji: '🖊️', name: 'pen', keywords: 'pen write' },
      { emoji: '✏️', name: 'pencil', keywords: 'pencil write draw' },
      { emoji: '📝', name: 'memo', keywords: 'note write memo' },
      { emoji: '📎', name: 'paperclip', keywords: 'paperclip attach' },
      { emoji: '✂️', name: 'scissors', keywords: 'scissors cut' },
      { emoji: '👓', name: 'glasses', keywords: 'glasses eyeglasses' },
      { emoji: '🕶️', name: 'sunglasses', keywords: 'sunglasses shades' },
      { emoji: '👑', name: 'crown', keywords: 'crown king queen royalty' },
      { emoji: '🎩', name: 'top hat', keywords: 'hat magic formal' },
      { emoji: '👞', name: "man's shoe", keywords: 'shoe dress' },
      { emoji: '👟', name: 'running shoe', keywords: 'sneaker trainer' },
      { emoji: '🥾', name: 'hiking boot', keywords: 'boot hiking' },
      { emoji: '🧳', name: 'luggage', keywords: 'luggage suitcase bag' },
      { emoji: '🎒', name: 'backpack', keywords: 'backpack school bag' },
      { emoji: '👛', name: 'purse', keywords: 'purse handbag wallet' },
      { emoji: '👜', name: 'handbag', keywords: 'handbag purse' },
      { emoji: '🔑', name: 'key', keywords: 'key lock unlock' },
      { emoji: '🗝️', name: 'old key', keywords: 'key lock unlock' },
      { emoji: '🔒', name: 'locked', keywords: 'lock locked secure' },
      { emoji: '🔓', name: 'unlocked', keywords: 'lock open unlock' },
      { emoji: '⚒️', name: 'hammer and pick', keywords: 'tools mining build' },
      { emoji: '🛠️', name: 'hammer and wrench', keywords: 'tools repair build' },
      { emoji: '🔨', name: 'hammer', keywords: 'tools build hammer' },
      { emoji: '🔧', name: 'wrench', keywords: 'tools fix wrench' },
      { emoji: '🧱', name: 'brick', keywords: 'brick build wall' },
      { emoji: '🛒', name: 'shopping basket', keywords: 'shopping cart store' },
      { emoji: '🛍️', name: 'shopping bags', keywords: 'shopping store buy' },
      { emoji: '🎁', name: 'wrapped gift', keywords: 'gift present' },
      { emoji: '🎈', name: 'balloon', keywords: 'balloon party' },
      { emoji: '🎉', name: 'party popper', keywords: 'celebrate party congrats' },
      { emoji: '🎊', name: 'confetti ball', keywords: 'celebrate party confetti' },
      { emoji: '🪄', name: 'magic wand', keywords: 'magic wand sparkle' },
      { emoji: '🛋️', name: 'couch and lamp', keywords: 'sofa couch furniture' },
      { emoji: '🛏️', name: 'bed', keywords: 'bed sleep bedroom' },
      { emoji: '🧸', name: 'teddy bear', keywords: 'toy teddy plush' },
      { emoji: '🗑️', name: 'wastebasket', keywords: 'trash bin rubbish' },
      { emoji: '👍', name: 'thumbs up', keywords: 'like approve thumbs yes' },
      { emoji: '👎', name: 'thumbs down', keywords: 'dislike thumbs no' },
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: '❗',
    items: [
      { emoji: '❤️', name: 'red heart', keywords: 'love heart like' },
      { emoji: '🧡', name: 'orange heart', keywords: 'love heart' },
      { emoji: '💛', name: 'yellow heart', keywords: 'love heart' },
      { emoji: '💚', name: 'green heart', keywords: 'love heart' },
      { emoji: '💙', name: 'blue heart', keywords: 'love heart' },
      { emoji: '💜', name: 'purple heart', keywords: 'love heart' },
      { emoji: '🖤', name: 'black heart', keywords: 'love heart dark' },
      { emoji: '🤍', name: 'white heart', keywords: 'love heart' },
      { emoji: '🤎', name: 'brown heart', keywords: 'love heart' },
      { emoji: '🩷', name: 'pink heart', keywords: 'love heart' },
      { emoji: '💗', name: 'growing heart', keywords: 'love heart' },
      { emoji: '💖', name: 'sparkling heart', keywords: 'love heart sparkle' },
      { emoji: '💘', name: 'heart with arrow', keywords: 'love valentine cupid' },
      { emoji: '💝', name: 'heart with ribbon', keywords: 'love valentine gift' },
      { emoji: '💞', name: 'revolving hearts', keywords: 'love romance hearts' },
      { emoji: '💓', name: 'beating heart', keywords: 'love heartbeat' },
      { emoji: '💕', name: 'two hearts', keywords: 'love affection' },
      { emoji: '💟', name: 'heart exclamation', keywords: 'love' },
      { emoji: '❣️', name: 'heart exclamation mark', keywords: 'love' },
      { emoji: '💔', name: 'broken heart', keywords: 'love sad breakup' },
      { emoji: '🫀', name: 'anatomical heart', keywords: 'love organ heart' },
      { emoji: '❤️‍🔥', name: 'heart on fire', keywords: 'love passion fire' },
      { emoji: '❤‍🩹', name: 'mending heart', keywords: 'love heal heart' },
      { emoji: '✝️', name: 'latin cross', keywords: 'religion christian cross' },
      { emoji: '☪️', name: 'star and crescent', keywords: 'religion islam' },
      { emoji: '🕉️', name: 'star of david', keywords: 'religion judaism' },
      { emoji: '☸️', name: 'wheel of dharma', keywords: 'religion buddhism' },
      { emoji: '🕎', name: 'menorah', keywords: 'religion jewish candle' },
      { emoji: '☯️', name: 'yin yang', keywords: 'balance tao zen' },
      { emoji: '☦️', name: 'orthodox cross', keywords: 'religion christian cross' },
      { emoji: '♻️', name: 'recycle', keywords: 'environment reuse symbol' },
      { emoji: '🔴', name: 'red circle', keywords: 'red circle shape' },
      { emoji: '🟠', name: 'orange circle', keywords: 'orange circle shape' },
      { emoji: '🟡', name: 'yellow circle', keywords: 'yellow circle shape' },
      { emoji: '🟢', name: 'green circle', keywords: 'green circle shape' },
      { emoji: '🔵', name: 'blue circle', keywords: 'blue circle shape' },
      { emoji: '🟣', name: 'purple circle', keywords: 'purple circle shape' },
      { emoji: '⚫', name: 'black circle', keywords: 'black circle shape' },
      { emoji: '⚪', name: 'white circle', keywords: 'white circle shape' },
      { emoji: '❇️', name: 'sparkle', keywords: 'sparkle shine' },
      { emoji: '✳️', name: 'eight-spoked asterisk', keywords: 'asterisk star' },
      { emoji: '✴️', name: 'eight-pointed black star', keywords: 'star asterisk' },
      { emoji: '❃', name: 'heavy asterisk', keywords: 'asterisk star' },
      { emoji: '➰', name: 'curly loop', keywords: 'loop swirl' },
      { emoji: '💫', name: 'dizzy', keywords: 'stars swirl magic' },
      { emoji: '⭐', name: 'star', keywords: 'star favorite' },
      { emoji: '🌟', name: 'glowing star', keywords: 'star sparkle' },
      { emoji: '✨', name: 'sparkles', keywords: 'magic shine sparkles' },
      { emoji: '⚡', name: 'high voltage', keywords: 'zap lightning energy' },
      { emoji: '💥', name: 'collision', keywords: 'explosion boom' },
      { emoji: '💨', name: 'dashing away', keywords: 'wind fast smoke' },
      { emoji: '💦', name: 'sweat droplets', keywords: 'water splash' },
      { emoji: '💯', name: 'hundred points', keywords: '100 perfect score' },
      { emoji: '🔥', name: 'fire', keywords: 'hot lit burn flame' },
      { emoji: '▶️', name: 'play button', keywords: 'play media' },
      { emoji: '⏸️', name: 'pause button', keywords: 'pause media' },
      { emoji: '⏹️', name: 'stop button', keywords: 'stop media' },
      { emoji: '⏭️', name: 'next track button', keywords: 'next skip' },
      { emoji: '🔀', name: 'shuffle tracks button', keywords: 'shuffle random' },
      { emoji: '🔁', name: 'repeat button', keywords: 'repeat loop' },
      { emoji: '⏩', name: 'fast forward button', keywords: 'forward fast' },
      { emoji: '⏪', name: 'rewind button', keywords: 'rewind back' },
      { emoji: '🔝', name: 'top arrow', keywords: 'up arrow' },
      { emoji: '🔙', name: 'back arrow', keywords: 'back arrow' },
      { emoji: '❓', name: 'question mark', keywords: 'question ask' },
      { emoji: '❕', name: 'white exclamation mark', keywords: 'surprise' },
      { emoji: '⚠️', name: 'warning', keywords: 'caution alert warning' },
      { emoji: '🚸', name: 'children crossing', keywords: 'sign school caution' },
      { emoji: '❌', name: 'cross mark', keywords: 'no wrong cancel' },
      { emoji: '✔️', name: 'check mark', keywords: 'yes check correct' },
      { emoji: '✅', name: 'check mark button', keywords: 'yes check done' },
      { emoji: '➕', name: 'plus', keywords: 'math add plus' },
      { emoji: '➖', name: 'minus', keywords: 'math subtract' },
      { emoji: '♾️', name: 'infinity', keywords: 'math forever' },
      { emoji: '⛔', name: 'no entry', keywords: 'forbidden stop' },
      { emoji: '🚫', name: 'prohibited', keywords: 'no forbidden' },
      { emoji: 'ℹ️', name: 'information', keywords: 'info info' },
    ],
  },
  {
    id: 'flags',
    name: 'Flags',
    icon: '🚩',
    items: [
      { emoji: '🇦🇷', name: 'flag Argentina', keywords: 'argentina flag country' },
      { emoji: '🇦🇹', name: 'flag Austria', keywords: 'austria flag country' },
      { emoji: '🇦🇺', name: 'flag Australia', keywords: 'australia flag country' },
      { emoji: '🇧🇪', name: 'flag Belgium', keywords: 'belgium flag country' },
      { emoji: '🇧🇷', name: 'flag Brazil', keywords: 'brazil flag country' },
      { emoji: '🇨🇦', name: 'flag Canada', keywords: 'canada flag country' },
      { emoji: '🇨🇭', name: 'flag Switzerland', keywords: 'switzerland flag country' },
      { emoji: '🇨🇳', name: 'flag China', keywords: 'china flag country' },
      { emoji: '🇨🇴', name: 'flag Colombia', keywords: 'colombia flag country' },
      { emoji: '🇩🇪', name: 'flag Germany', keywords: 'germany flag country' },
      { emoji: '🇩🇰', name: 'flag Denmark', keywords: 'denmark flag country' },
      { emoji: '🇪🇬', name: 'flag Egypt', keywords: 'egypt flag country' },
      { emoji: '🇪🇸', name: 'flag Spain', keywords: 'spain flag country' },
      { emoji: '🇫🇮', name: 'flag Finland', keywords: 'finland flag country' },
      { emoji: '🇫🇷', name: 'flag France', keywords: 'france flag country' },
      { emoji: '🇬🇧', name: 'flag United Kingdom', keywords: 'uk britain england flag' },
      { emoji: '🇬🇷', name: 'flag Greece', keywords: 'greece flag country' },
      { emoji: '🇭🇷', name: 'flag Croatia', keywords: 'croatia flag country' },
      { emoji: '🇭🇺', name: 'flag Hungary', keywords: 'hungary flag country' },
      { emoji: '🇮🇩', name: 'flag Indonesia', keywords: 'indonesia flag country' },
      { emoji: '🇮🇪', name: 'flag Ireland', keywords: 'ireland flag country' },
      { emoji: '🇮🇱', name: 'flag Israel', keywords: 'israel flag country' },
      { emoji: '🇮🇳', name: 'flag India', keywords: 'india flag country' },
      { emoji: '🇮🇸', name: 'flag Iceland', keywords: 'iceland flag country' },
      { emoji: '🇮🇹', name: 'flag Italy', keywords: 'italy flag country' },
      { emoji: '🇯🇵', name: 'flag Japan', keywords: 'japan flag country' },
      { emoji: '🇰🇷', name: 'flag South Korea', keywords: 'korea flag country' },
      { emoji: '🇱🇦', name: 'flag Luxembourg', keywords: 'luxembourg flag country' },
      { emoji: '🇱🇻', name: 'flag Latvia', keywords: 'latvia flag country' },
      { emoji: '🇲🇽', name: 'flag Mexico', keywords: 'mexico flag country' },
      { emoji: '🇲🇾', name: 'flag Malaysia', keywords: 'malaysia flag country' },
      { emoji: '🇳🇬', name: 'flag Nigeria', keywords: 'nigeria flag country' },
      { emoji: '🇳🇱', name: 'flag Netherlands', keywords: 'netherlands holland flag' },
      { emoji: '🇳🇴', name: 'flag Norway', keywords: 'norway flag country' },
      { emoji: '🇳🇿', name: 'flag New Zealand', keywords: 'new zealand flag country' },
      { emoji: '🇵🇭', name: 'flag Philippines', keywords: 'philippines flag country' },
      { emoji: '🇵🇰', name: 'flag Pakistan', keywords: 'pakistan flag country' },
      { emoji: '🇵🇱', name: 'flag Poland', keywords: 'poland flag country' },
      { emoji: '🇵🇹', name: 'flag Portugal', keywords: 'portugal flag country' },
      { emoji: '🇷🇴', name: 'flag Romania', keywords: 'romania flag country' },
      { emoji: '🇷🇺', name: 'flag Russia', keywords: 'russia flag country' },
      { emoji: '🇸🇦', name: 'flag Saudi Arabia', keywords: 'saudi arabia flag country' },
      { emoji: '🇸🇪', name: 'flag Sweden', keywords: 'sweden flag country' },
      { emoji: '🇸🇬', name: 'flag Singapore', keywords: 'singapore flag country' },
      { emoji: '🇹🇭', name: 'flag Thailand', keywords: 'thailand flag country' },
      { emoji: '🇹🇷', name: 'flag Türkiye', keywords: 'turkey turkiye flag country' },
      { emoji: '🇺🇦', name: 'flag Ukraine', keywords: 'ukraine flag country' },
      { emoji: '🇺🇸', name: 'flag United States', keywords: 'usa america flag country' },
      { emoji: '🇻🇳', name: 'flag Vietnam', keywords: 'vietnam flag country' },
      { emoji: '🇿🇦', name: 'flag South Africa', keywords: 'south africa flag country' },
      { emoji: '🏁', name: 'chequered flag', keywords: 'finish race flag' },
      { emoji: '🏳️', name: 'white flag', keywords: 'surrender white flag' },
      { emoji: '🏴', name: 'black flag', keywords: 'pirate black flag' },
      { emoji: '🎌', name: 'crossed flags', keywords: 'crossed flags japan' },
      { emoji: '🏳️‍🌈', name: 'rainbow flag', keywords: 'pride rainbow flag lgbt' },
      { emoji: '🏳️‍⚧️', name: 'transgender flag', keywords: 'trans pride flag lgbt' },
    ],
  },
];

/**
 * Commonly used reaction emoji, shown as the quick-reaction bar under a message.
 *
 * @type {string[]}
 */
export const QUICK_REACTIONS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '😡',
  '😍',
  '🙏',
  '👏',
  '🔥',
  '🎉',
  '✅',
  '❌',
  '💯',
];

/**
 * Key used to persist the recently used emoji list.
 *
 * @type {string}
 */
export const RECENT_STORAGE_KEY = 'chirp.emoji.recent';

/**
 * Every item of every category, flattened into a single searchable list.
 *
 * @type {EmojiItem[]}
 */
const ALL_ITEMS = EMOJI_CATEGORIES.flatMap((category) => category.items);

/**
 * Lookup table from an emoji character to its human readable name.
 *
 * @type {Map<string, string>}
 */
const NAME_BY_EMOJI = new Map();
for (const item of ALL_ITEMS) {
  if (!NAME_BY_EMOJI.has(item.emoji)) {
    NAME_BY_EMOJI.set(item.emoji, item.name);
  }
}

/**
 * Scoring weights used by {@link searchEmoji}. Higher is a better match.
 *
 * @type {Object}
 */
const SCORES = {
  nameExact: 120,
  namePrefix: 70,
  nameWordPrefix: 55,
  nameContains: 30,
  keywordExact: 90,
  keywordPrefix: 45,
  keywordContains: 20,
};

/**
 * Score a single search token against a single emoji item.
 *
 * Exact and prefix matches outrank plain substring matches, and matches on
 * the `name` outrank matches on the `keywords`.
 *
 * @param {EmojiItem} item The emoji entry to score.
 * @param {string} token A single lowercased search token.
 * @returns {number} The score, or `0` when the token does not match at all.
 */
function scoreToken(item, token) {
  const name = item.name.toLowerCase();
  const keywords = item.keywords.toLowerCase();

  if (name === token) {
    return SCORES.nameExact;
  }
  if (name.startsWith(token)) {
    return SCORES.namePrefix;
  }

  const nameWords = name.split(/[\s-]+/).filter(Boolean);
  if (nameWords.some((word) => word.startsWith(token))) {
    return SCORES.nameWordPrefix;
  }
  if (name.includes(token)) {
    return SCORES.nameContains;
  }

  const keywordWords = keywords.split(/\s+/).filter(Boolean);
  if (keywordWords.includes(token)) {
    return SCORES.keywordExact;
  }
  if (keywordWords.some((word) => word.startsWith(token))) {
    return SCORES.keywordPrefix;
  }
  if (keywords.includes(token)) {
    return SCORES.keywordContains;
  }

  return 0;
}

/**
 * Search the emoji dataset by name and keywords.
 *
 * The search is case-insensitive and token based: a multi word query only
 * matches when *every* token matches the name or the keywords of an entry.
 * Results are ordered by relevance, best match first.
 *
 * @param {string} query The search text. An empty query returns no results,
 *   which lets the UI fall back to rendering the category tabs.
 * @param {number} [limit=40] The maximum number of results to return.
 * @returns {Array<{emoji: string, name: string, keywords: string}>} The
 *   matching entries, best match first.
 */
export function searchEmoji(query, limit = 40) {
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (!needle) {
    return [];
  }

  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 40;
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const matches = [];

  for (const item of ALL_ITEMS) {
    let score = 0;
    let matchedAll = true;

    for (const token of tokens) {
      const tokenScore = scoreToken(item, token);
      if (tokenScore === 0) {
        matchedAll = false;
        break;
      }
      score += tokenScore;
    }

    if (matchedAll) {
      matches.push({ item, score });
    }
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.item.name.length !== b.item.name.length) {
      return a.item.name.length - b.item.name.length;
    }
    return a.item.name.localeCompare(b.item.name);
  });

  return matches.slice(0, max).map((match) => ({
    emoji: match.item.emoji,
    name: match.item.name,
    keywords: match.item.keywords,
  }));
}

/**
 * Look up the human readable name of an emoji.
 *
 * @param {string} emoji The emoji character to look up.
 * @returns {string} The name of the emoji, or an empty string when the emoji
 *   is not part of the dataset.
 */
export function emojiName(emoji) {
  if (typeof emoji !== 'string' || !emoji) {
    return '';
  }
  return NAME_BY_EMOJI.get(emoji) || '';
}

/**
 * Read the `localStorage` instance, if the environment provides one.
 *
 * Accessing `localStorage` can throw (for example in a sandboxed iframe with
 * blocked third party storage), so this never throws.
 *
 * @returns {Storage|null} The storage object, or `null` when unavailable.
 */
function getStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) {
      return null;
    }
    return localStorage;
  } catch (error) {
    return null;
  }
}

/**
 * Read and sanitize the raw recently used list from `localStorage`.
 *
 * Never throws; malformed or missing data yields an empty list.
 *
 * @returns {string[]} The stored emoji, most recent first.
 */
function readStoredRecent() {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(RECENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const seen = new Set();
    const result = [];

    for (const entry of parsed) {
      if (typeof entry !== 'string') {
        continue;
      }
      const emoji = entry.trim();
      if (!emoji || seen.has(emoji)) {
        continue;
      }
      seen.add(emoji);
      result.push(emoji);
    }

    return result;
  } catch (error) {
    return [];
  }
}

/**
 * Load the recently used emoji, most recent first.
 *
 * Never throws: when `localStorage` is unavailable or corrupted an empty
 * list is returned.
 *
 * @param {number} [limit=16] The maximum number of entries to return.
 * @returns {string[]} The recently used emoji.
 */
export function loadRecentEmoji(limit = 16) {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 16;
  return readStoredRecent().slice(0, max);
}

/**
 * Remember an emoji as recently used.
 *
 * The emoji is moved to the front of the list, duplicates are removed and the
 * list is truncated to `limit` entries. The updated list is persisted to
 * `localStorage` and returned. Never throws.
 *
 * @param {string} emoji The emoji to remember.
 * @param {number} [limit=16] The maximum number of entries to keep.
 * @returns {string[]} The updated list of recently used emoji.
 */
export function pushRecentEmoji(emoji, limit = 16) {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 16;
  const value = typeof emoji === 'string' ? emoji.trim() : '';

  if (!value) {
    return loadRecentEmoji(max);
  }

  const updated = [value, ...readStoredRecent().filter((entry) => entry !== value)].slice(0, max);

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(RECENT_STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      // Storage may be full or blocked; the in-memory result is still useful.
    }
  }

  return updated;
}

/**
 * Forget all recently used emoji.
 *
 * Never throws: when `localStorage` is unavailable this is a no-op.
 *
 * @returns {void}
 */
export function clearRecentEmoji() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(RECENT_STORAGE_KEY);
  } catch (error) {
    // Ignore storage failures; the list is best effort only.
  }
}
