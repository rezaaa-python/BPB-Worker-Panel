document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.querySelector('.login-section');
    const panelSection = document.querySelector('.panel-section');
    const loginBtn = document.getElementById('login-btn');
    const adminKeyInput = document.getElementById('admin-key');
    const saveUserBtn = document.getElementById('save-user-btn');
    const refreshUsersBtn = document.getElementById('refresh-users-btn');
    const usersTableBody = document.querySelector('#users-table tbody');
    const userUuidInput = document.getElementById('user-uuid');
    const userExpirationInput = document.getElementById('user-expiration');
    const userNotesInput = document.getElementById('user-notes');

    let adminKey = '';

    loginBtn.addEventListener('click', () => {
        adminKey = adminKeyInput.value;
        if (adminKey) {
            loginSection.style.display = 'none';
            panelSection.style.display = 'block';
            fetchUsers();
        } else {
            alert('Please enter the admin key.');
        }
    });

    async function apiFetch(path, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminKey}`,
            ...options.headers,
        };

        const response = await fetch(`/admin/api${path}`, { ...options, headers });

        if (response.status === 401) {
            alert('Unauthorized. Please check your admin key.');
            loginSection.style.display = 'block';
            panelSection.style.display = 'none';
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred' }));
            throw new Error(errorData.error);
        }

        return response.json();
    }

    async function fetchUsers() {
        try {
            const users = await apiFetch('/users');
            renderUsers(users);
        } catch (error) {
            console.error('Failed to fetch users:', error);
            alert(`Error: ${error.message}`);
        }
    }

    function renderUsers(users) {
        usersTableBody.innerHTML = '';
        users.forEach(user => {
            const expirationDate = new Date(user.expiration_timestamp * 1000);
            const createdDate = new Date(user.created_at * 1000);
            const isExpired = expirationDate < new Date();

            const row = document.createElement('tr');
            row.innerHTML = `
                <td data-label="UUID">${user.id}</td>
                <td data-label="Expiration">${expirationDate.toLocaleString()}</td>
                <td data-label="Status" class="${isExpired ? 'status-expired' : 'status-active'}">${user.status}</td>
                <td data-label="Notes">${user.notes || ''}</td>
                <td data-label="Created At">${createdDate.toLocaleString()}</td>
                <td data-label="Actions">
                    <button class="delete-btn" data-id="${user.id}">Delete</button>
                </td>
            `;
            usersTableBody.appendChild(row);
        });

        document.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', handleDeleteUser);
        });
    }

    saveUserBtn.addEventListener('click', async () => {
        const id = userUuidInput.value.trim();
        const expiration = userExpirationInput.value;
        const notes = userNotesInput.value.trim();

        if (!expiration) {
            alert('Expiration date is required.');
            return;
        }

        const expiration_timestamp = Math.floor(new Date(expiration).getTime() / 1000);

        const userData = {
            id: id || undefined,
            expiration_timestamp,
            notes,
        };

        try {
            await apiFetch('/users', {
                method: 'POST',
                body: JSON.stringify(userData),
            });
            alert('User saved successfully!');
            userUuidInput.value = '';
            userExpirationInput.value = '';
            userNotesInput.value = '';
            fetchUsers();
        } catch (error) {
            console.error('Failed to save user:', error);
            alert(`Error: ${error.message}`);
        }
    });

    async function handleDeleteUser(event) {
        const id = event.target.dataset.id;
        if (confirm(`Are you sure you want to delete user ${id}?`)) {
            try {
                await apiFetch(`/users/${id}`, {
                    method: 'DELETE',
                });
                alert('User deleted successfully!');
                fetchUsers();
            } catch (error) {
                console.error('Failed to delete user:', error);
                alert(`Error: ${error.message}`);
            }
        }
    }

    refreshUsersBtn.addEventListener('click', fetchUsers);
});
