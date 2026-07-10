// Fictional league identity + player name generation. All teams are original
// creations (no real-league city/nickname combos).

import type { Rand } from './rng';

export interface TeamIdentity {
  city: string;
  name: string;
  abbr: string;
  colors: [string, string];
}

// 32 teams: 2 conferences x 4 divisions x 4 teams, in listing order.
// Conference 0 = "Atlantic", Conference 1 = "Pacific".
export const TEAM_IDENTITIES: TeamIdentity[] = [
  // Atlantic East
  { city: 'Boston', name: 'Minutemen', abbr: 'BOS', colors: ['#1d3557', '#e63946'] },
  { city: 'Brooklyn', name: 'Bruisers', abbr: 'BRK', colors: ['#2b2d42', '#8d99ae'] },
  { city: 'Philadelphia', name: 'Founders', abbr: 'PHI', colors: ['#004225', '#c9a227'] },
  { city: 'Washington', name: 'Generals', abbr: 'WAS', colors: ['#5b1a2e', '#d4af37'] },
  // Atlantic North
  { city: 'Chicago', name: 'Blaze', abbr: 'CHI', colors: ['#c1440e', '#101820'] },
  { city: 'Detroit', name: 'Motors', abbr: 'DET', colors: ['#0f4c81', '#c0c0c0'] },
  { city: 'Cleveland', name: 'Rockers', abbr: 'CLE', colors: ['#4b306a', '#f2a900'] },
  { city: 'Milwaukee', name: 'Herd', abbr: 'MIL', colors: ['#2e5339', '#e8d3a2'] },
  // Atlantic South
  { city: 'Atlanta', name: 'Firebirds', abbr: 'ATL', colors: ['#b3202c', '#2b2b2b'] },
  { city: 'Miami', name: 'Stingrays', abbr: 'MIA', colors: ['#008e97', '#f58220'] },
  { city: 'Charlotte', name: 'Aviators', abbr: 'CHA', colors: ['#00538c', '#a2aaad'] },
  { city: 'Nashville', name: 'Rhythm', abbr: 'NSH', colors: ['#41b6e6', '#ffb81c'] },
  // Atlantic West
  { city: 'St. Louis', name: 'Archers', abbr: 'STL', colors: ['#7a0019', '#ffcc33'] },
  { city: 'Kansas City', name: 'Scouts', abbr: 'KC', colors: ['#cc0000', '#ffd700'] },
  { city: 'Minneapolis', name: 'Northmen', abbr: 'MIN', colors: ['#3f2a56', '#f0b323'] },
  { city: 'Indianapolis', name: 'Racers', abbr: 'IND', colors: ['#003da5', '#ffffff'] },
  // Pacific East
  { city: 'Dallas', name: 'Wranglers', abbr: 'DAL', colors: ['#0b2265', '#b0b7bc'] },
  { city: 'Houston', name: 'Comets', abbr: 'HOU', colors: ['#d22630', '#0c1c47'] },
  { city: 'San Antonio', name: 'Defenders', abbr: 'SA', colors: ['#3a3a3a', '#c4ced4'] },
  { city: 'New Orleans', name: 'Brass', abbr: 'NO', colors: ['#101820', '#d3bc8d'] },
  // Pacific North
  { city: 'Seattle', name: 'Evergreens', abbr: 'SEA', colors: ['#0b3d2e', '#69be28'] },
  { city: 'Portland', name: 'Lumberjacks', abbr: 'POR', colors: ['#5c4033', '#e35205'] },
  { city: 'Salt Lake City', name: 'Summit', abbr: 'SLC', colors: ['#2d2926', '#f9a01b'] },
  { city: 'Denver', name: 'Bighorns', abbr: 'DEN', colors: ['#4b3f2f', '#fb4f14'] },
  // Pacific South
  { city: 'Los Angeles', name: 'Quakes', abbr: 'LA', colors: ['#552583', '#fdb927'] },
  { city: 'San Diego', name: 'Mariners', abbr: 'SD', colors: ['#002244', '#ffb612'] },
  { city: 'Phoenix', name: 'Scorpions', abbr: 'PHX', colors: ['#8c1d40', '#ffc627'] },
  { city: 'Las Vegas', name: 'Aces', abbr: 'LV', colors: ['#101820', '#c8102e'] },
  // Pacific West
  { city: 'San Francisco', name: 'Fog', abbr: 'SF', colors: ['#41424c', '#b9975b'] },
  { city: 'Oakland', name: 'Oaks', abbr: 'OAK', colors: ['#1b4d3e', '#efb21e'] },
  { city: 'Sacramento', name: 'Miners', abbr: 'SAC', colors: ['#5a2d81', '#63727a'] },
  { city: 'Honolulu', name: 'Volcanoes', abbr: 'HON', colors: ['#aa0000', '#00a3e0'] },
];

export const CONFERENCE_NAMES = ['Atlantic', 'Pacific'];
export const DIVISION_NAMES = ['East', 'North', 'South', 'West'];

const FIRST_NAMES = [
  'Aaron', 'Adrian', 'Alonzo', 'Amari', 'Andre', 'Anthony', 'Antoine', 'Austin', 'Avery',
  'Blake', 'Brandon', 'Brady', 'Brock', 'Bryce', 'Caleb', 'Cameron', 'Carl', 'Carson',
  'Cedric', 'Chad', 'Charles', 'Chase', 'Chris', 'Cole', 'Colin', 'Cooper', 'Corey',
  'Curtis', 'Dallas', 'Damian', 'Dante', 'Darius', 'Darnell', 'David', 'Dawson', 'DeAndre',
  'Deion', 'Demarcus', 'Dennis', 'Deon', 'Derek', 'Deshawn', 'Devin', 'Dexter', 'Dillon',
  'Dominic', 'Donovan', 'Drew', 'Dwayne', 'Dylan', 'Earl', 'Eli', 'Elijah', 'Emmanuel',
  'Eric', 'Ernest', 'Ethan', 'Evan', 'Ezekiel', 'Felix', 'Frank', 'Gabriel', 'Garrett',
  'Gavin', 'George', 'Grant', 'Greg', 'Harold', 'Hayden', 'Hector', 'Henry', 'Hunter',
  'Isaac', 'Isaiah', 'Ivan', 'Jabari', 'Jack', 'Jackson', 'Jacob', 'Jaden', 'Jake',
  'Jalen', 'Jamal', 'Jamar', 'James', 'Jared', 'Jarvis', 'Jason', 'Javon', 'Jaxon',
  'Jay', 'Jeremiah', 'Jerome', 'Jesse', 'Jimmy', 'Joel', 'Jonah', 'Jordan', 'Joseph',
  'Josh', 'Julian', 'Justice', 'Justin', 'Kai', 'Kareem', 'Keenan', 'Kendall', 'Kendrick',
  'Kevin', 'Khalil', 'Kobe', 'Kurt', 'Kyle', 'Kyler', 'Lamar', 'Lance', 'Landon',
  'Lawrence', 'Leon', 'Levi', 'Logan', 'Lonnie', 'Louis', 'Lucas', 'Luke', 'Malcolm',
  'Malik', 'Marcus', 'Mario', 'Marquis', 'Marshall', 'Martin', 'Mason', 'Matthew', 'Maurice',
  'Max', 'Melvin', 'Micah', 'Michael', 'Miles', 'Mitchell', 'Mohamed', 'Morgan', 'Moses',
  'Nathan', 'Nick', 'Noah', 'Nolan', 'Omar', 'Oscar', 'Otis', 'Owen', 'Parker',
  'Patrick', 'Paul', 'Peyton', 'Philip', 'Preston', 'Quentin', 'Quincy', 'Rafael', 'Rashad',
  'Ray', 'Reggie', 'Reuben', 'Ricardo', 'Riley', 'Robert', 'Roman', 'Ronald', 'Roy',
  'Russell', 'Ryan', 'Sam', 'Santiago', 'Saul', 'Sean', 'Seth', 'Shane', 'Shawn',
  'Sidney', 'Silas', 'Simon', 'Solomon', 'Spencer', 'Stefon', 'Sterling', 'Steve', 'Tanner',
  'Terrance', 'Terrell', 'Theo', 'Thomas', 'Titus', 'Travis', 'Trent', 'Trevor', 'Trey',
  'Tristan', 'Troy', 'Tucker', 'Tyler', 'Tyrone', 'Tyson', 'Victor', 'Vince', 'Walker',
  'Walter', 'Warren', 'Wesley', 'Will', 'Xavier', 'Zach', 'Zane', 'Zion',
];

const LAST_NAMES = [
  'Abbott', 'Adams', 'Alexander', 'Allen', 'Anderson', 'Andrews', 'Armstrong', 'Atkins',
  'Bailey', 'Baker', 'Banks', 'Barnes', 'Barrett', 'Bates', 'Beck', 'Bell', 'Bennett',
  'Benson', 'Berry', 'Bishop', 'Black', 'Blair', 'Bolton', 'Booker', 'Bowman', 'Boyd',
  'Bradley', 'Brandt', 'Brewer', 'Briggs', 'Brooks', 'Brown', 'Bryant', 'Buchanan', 'Burke',
  'Burns', 'Burton', 'Butler', 'Byrd', 'Caldwell', 'Campbell', 'Cannon', 'Carey', 'Carr',
  'Carson', 'Carter', 'Chambers', 'Chandler', 'Chapman', 'Christian', 'Clark', 'Clay',
  'Coleman', 'Collins', 'Conner', 'Cook', 'Cooper', 'Cortez', 'Cox', 'Craig', 'Crawford',
  'Cross', 'Cruz', 'Cunningham', 'Curry', 'Curtis', 'Dalton', 'Daniels', 'Davenport',
  'Davis', 'Dawson', 'Day', 'Dean', 'Delgado', 'Dennis', 'Diaz', 'Dickson', 'Dixon',
  'Donovan', 'Dorsey', 'Douglas', 'Doyle', 'Drake', 'Dudley', 'Duncan', 'Dunn', 'Duran',
  'Easton', 'Edwards', 'Elliott', 'Ellis', 'Emerson', 'English', 'Erickson', 'Espinoza',
  'Estes', 'Evans', 'Farley', 'Farrell', 'Faulkner', 'Ferguson', 'Fields', 'Finley',
  'Fisher', 'Fitzgerald', 'Fleming', 'Fletcher', 'Flores', 'Floyd', 'Foley', 'Forbes',
  'Ford', 'Foster', 'Fowler', 'Fox', 'Francis', 'Franklin', 'Frazier', 'Freeman', 'Frost',
  'Fuller', 'Gaines', 'Gallagher', 'Garcia', 'Gardner', 'Garner', 'Garrett', 'Garrison',
  'Gates', 'Gibbs', 'Gibson', 'Gilbert', 'Giles', 'Gill', 'Glover', 'Goodman', 'Gordon',
  'Grady', 'Graham', 'Grant', 'Graves', 'Gray', 'Green', 'Greer', 'Griffin', 'Gross',
  'Guerrero', 'Gutierrez', 'Hahn', 'Hale', 'Haley', 'Hall', 'Hamilton', 'Hammond', 'Hampton',
  'Hancock', 'Haney', 'Hardin', 'Harmon', 'Harper', 'Harris', 'Harrison', 'Hart', 'Harvey',
  'Hawkins', 'Hayes', 'Haynes', 'Henderson', 'Hendrix', 'Henry', 'Hensley', 'Herman',
  'Hernandez', 'Herrera', 'Hess', 'Hickman', 'Hicks', 'Higgins', 'Hill', 'Hines', 'Hobbs',
  'Hodge', 'Hoffman', 'Hogan', 'Holden', 'Holland', 'Holloway', 'Holmes', 'Holt', 'Hooper',
  'Hopkins', 'Horn', 'Horton', 'House', 'Houston', 'Howard', 'Howell', 'Hubbard', 'Hudson',
  'Huff', 'Hughes', 'Hull', 'Hunt', 'Hunter', 'Hurley', 'Hutchinson', 'Ingram', 'Irwin',
  'Jackson', 'Jacobs', 'James', 'Jarvis', 'Jefferson', 'Jenkins', 'Jennings', 'Jensen',
  'Johnson', 'Johnston', 'Jones', 'Jordan', 'Joseph', 'Joyce', 'Juarez', 'Kane', 'Keith',
  'Keller', 'Kelley', 'Kemp', 'Kennedy', 'Kent', 'Kerr', 'Key', 'Kidd', 'King', 'Kirby',
  'Kirk', 'Knapp', 'Knight', 'Knox', 'Kramer', 'Lamb', 'Lambert', 'Lancaster', 'Landry',
  'Lane', 'Lang', 'Larsen', 'Larson', 'Lawrence', 'Lawson', 'Leach', 'Lee', 'Leon',
  'Leonard', 'Lester', 'Levine', 'Lewis', 'Lindsey', 'Little', 'Livingston', 'Lloyd',
  'Logan', 'Long', 'Lopez', 'Love', 'Lowe', 'Lucas', 'Lynch', 'Lyons', 'Mack', 'Madden',
  'Mahoney', 'Malone', 'Mann', 'Manning', 'Marks', 'Marsh', 'Marshall', 'Martin', 'Martinez',
  'Mason', 'Massey', 'Mathews', 'Maxwell', 'May', 'Mayer', 'Maynard', 'Mayo', 'McBride',
  'McCall', 'McCarthy', 'McClain', 'McConnell', 'McCoy', 'McCray', 'McDaniel', 'McDowell',
  'McGee', 'McGuire', 'McIntyre', 'McKay', 'McKee', 'McKenzie', 'McKinney', 'McLean',
  'McMahon', 'McNeil', 'Meadows', 'Mejia', 'Melton', 'Mendez', 'Mercer', 'Merritt', 'Meyer',
  'Michael', 'Middleton', 'Miles', 'Miller', 'Mills', 'Mitchell', 'Monroe', 'Montgomery',
  'Moody', 'Moon', 'Mooney', 'Moore', 'Morales', 'Moran', 'Moreno', 'Morgan', 'Morris',
  'Morrison', 'Morrow', 'Morse', 'Morton', 'Moses', 'Mosley', 'Moss', 'Mueller', 'Mullen',
  'Mullins', 'Munoz', 'Murphy', 'Murray', 'Myers', 'Nash', 'Navarro', 'Neal', 'Nelson',
  'Newman', 'Newton', 'Nichols', 'Nielsen', 'Nixon', 'Noble', 'Nolan', 'Norman', 'Norris',
  'Norton', 'Nunez', 'Odom', 'Oliver', 'Olsen', 'Olson', 'Orr', 'Ortega', 'Ortiz', 'Osborne',
  'Owens', 'Pace', 'Page', 'Palmer', 'Park', 'Parker', 'Parrish', 'Parsons', 'Patel',
  'Patrick', 'Patterson', 'Patton', 'Paul', 'Payne', 'Pearson', 'Peck', 'Pennington',
  'Perez', 'Perkins', 'Perry', 'Peters', 'Peterson', 'Petty', 'Phelps', 'Phillips',
  'Pierce', 'Pittman', 'Pitts', 'Pollard', 'Poole', 'Pope', 'Porter', 'Potter', 'Powell',
  'Powers', 'Pratt', 'Preston', 'Price', 'Prince', 'Pruitt', 'Pugh', 'Quinn', 'Ramirez',
  'Ramsey', 'Randall', 'Randolph', 'Rankin', 'Rasmussen', 'Ray', 'Raymond', 'Reed', 'Reese',
  'Reeves', 'Reid', 'Reilly', 'Reyes', 'Reynolds', 'Rhodes', 'Rice', 'Richards', 'Richardson',
  'Richmond', 'Riddle', 'Riggs', 'Riley', 'Rios', 'Rivera', 'Rivers', 'Roach', 'Robbins',
  'Roberson', 'Roberts', 'Robertson', 'Robinson', 'Rocha', 'Rodgers', 'Rodriguez', 'Rogers',
  'Rojas', 'Rollins', 'Roman', 'Rosales', 'Rose', 'Ross', 'Roth', 'Rowe', 'Rowland', 'Roy',
  'Rubio', 'Rush', 'Russell', 'Russo', 'Rutledge', 'Ryan', 'Salas', 'Salazar', 'Sampson',
  'Sanchez', 'Sanders', 'Sandoval', 'Sanford', 'Santana', 'Santiago', 'Santos', 'Saunders',
  'Savage', 'Sawyer', 'Schmidt', 'Schneider', 'Schroeder', 'Schultz', 'Scott', 'Sellers',
  'Serrano', 'Sexton', 'Shaffer', 'Shannon', 'Sharp', 'Shaw', 'Shelton', 'Shepard',
  'Shepherd', 'Sheppard', 'Sherman', 'Shields', 'Short', 'Silva', 'Simmons', 'Simon',
  'Simpson', 'Sims', 'Singleton', 'Skinner', 'Slater', 'Sloan', 'Small', 'Smith', 'Snider',
  'Snow', 'Snyder', 'Solis', 'Solomon', 'Sosa', 'Soto', 'Sparks', 'Spears', 'Spence',
  'Spencer', 'Stafford', 'Stanley', 'Stanton', 'Stark', 'Steele', 'Stein', 'Stephens',
  'Stephenson', 'Stevens', 'Stevenson', 'Stewart', 'Stokes', 'Stone', 'Stout', 'Strickland',
  'Strong', 'Stuart', 'Suarez', 'Sullivan', 'Summers', 'Sutton', 'Swanson', 'Sweeney',
  'Sykes', 'Talley', 'Tanner', 'Tate', 'Taylor', 'Terrell', 'Terry', 'Thomas', 'Thompson',
  'Thornton', 'Tillman', 'Todd', 'Torres', 'Townsend', 'Tran', 'Travis', 'Trevino', 'Trujillo',
  'Tucker', 'Turner', 'Tyler', 'Tyson', 'Underwood', 'Valdez', 'Valencia', 'Valentine',
  'Vance', 'Vargas', 'Vasquez', 'Vaughn', 'Vega', 'Velazquez', 'Villa', 'Vincent', 'Vinson',
  'Wade', 'Wagner', 'Walker', 'Wall', 'Wallace', 'Walsh', 'Walter', 'Walters', 'Walton',
  'Ward', 'Ware', 'Warner', 'Warren', 'Washington', 'Waters', 'Watkins', 'Watson', 'Watts',
  'Weaver', 'Webb', 'Weber', 'Webster', 'Weeks', 'Welch', 'Wells', 'West', 'Wheeler',
  'Whitaker', 'White', 'Whitehead', 'Whitfield', 'Whitley', 'Whitney', 'Wiggins', 'Wilcox',
  'Wilder', 'Wiley', 'Wilkerson', 'Wilkins', 'Wilkinson', 'William', 'Williams', 'Williamson',
  'Willis', 'Wilson', 'Winters', 'Wise', 'Witt', 'Wolf', 'Wolfe', 'Wong', 'Wood', 'Woodard',
  'Woods', 'Woodward', 'Wooten', 'Workman', 'Wright', 'Wyatt', 'Wynn', 'Yates', 'York',
  'Young', 'Zamora', 'Zavala', 'Zimmerman', 'Zuniga',
];

export function randomFirstName(r: Rand): string {
  return r.choice(FIRST_NAMES);
}

export function randomLastName(r: Rand): string {
  return r.choice(LAST_NAMES);
}
