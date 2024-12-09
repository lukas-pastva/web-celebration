// Mapping event types to Font Awesome icons
const eventIcons = {
    birthday: 'fa-birthday-cake',
    valentine: 'fa-heart',
    namesday: 'fa-user',
    christmas: 'fa-tree',
    wedding: 'fa-ring',
};

// Fetch and render celebrations
fetch('celebrations.yaml')
    .then(response => response.text())
    .then(yamlText => {
        const data = jsyaml.load(yamlText);
        renderCalendar(data.celebrations);
    })
    .catch(error => {
        console.error('Error loading YAML:', error);
    });

// Function to render the calendar
function renderCalendar(events) {
    const calendar = document.getElementById('calendar');
    const today = new Date();
    const currentYear = today.getFullYear();

    // Process events: set year to current year, adjust if already passed
    const processedEvents = events.map(event => {
        let [day, month, year] = event.date.split('.');
        day = parseInt(day);
        month = parseInt(month) - 1; // Months are 0-based
        year = parseInt(year) || currentYear;

        let eventDate = new Date(currentYear, month, day);
        if (eventDate < today) {
            eventDate.setFullYear(currentYear + 1);
        }
        return { ...event, eventDate };
    });

    // Sort events by date
    processedEvents.sort((a, b) => a.eventDate - b.eventDate);

    // Create event elements
    processedEvents.forEach((event, index) => {
        const eventDiv = document.createElement('div');
        eventDiv.classList.add('event');
        eventDiv.classList.add(index % 2 === 0 ? 'left' : 'right');

        const contentDiv = document.createElement('div');
        contentDiv.classList.add('content');

        // Icon
        const icon = document.createElement('i');
        icon.classList.add('fa-solid', eventIcons[event.type] || 'fa-star', 'icon');
        contentDiv.appendChild(icon);

        // Title
        const title = document.createElement('div');
        title.classList.add('title');
        title.textContent = capitalizeFirstLetter(event.type);
        contentDiv.appendChild(title);

        // Name
        const name = document.createElement('div');
        name.classList.add('name');
        name.textContent = event.name;
        contentDiv.appendChild(name);

        // Date
        const date = document.createElement('div');
        date.classList.add('date');
        date.textContent = formatDate(event.eventDate);
        contentDiv.appendChild(date);

        eventDiv.appendChild(contentDiv);
        calendar.appendChild(eventDiv);
    });
}

// Helper function to format date
function formatDate(date) {
    const options = { day: 'numeric', month: 'long' };
    return date.toLocaleDateString(undefined, options);
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}
