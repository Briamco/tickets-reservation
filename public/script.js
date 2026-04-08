const apiUrl = "/status";

const socket = io();

socket.on("reservationExpired", (payload) => {
  const localReservationId = localStorage.getItem("reservationId");
  const expiredReservationId = payload?.reservationId;

  if (localReservationId && localReservationId === expiredReservationId) {
    localStorage.removeItem("reservationId");
    document.getElementById("message").textContent = "Tu reserva expiró. Ya puedes reservar nuevamente.";
    document.getElementById("reserveBtn").hidden = false;
    document.getElementById("confirmBtn").hidden = true;
    document.getElementById("cancelBtn").hidden = true;
  }

  fetchStatus();
});

const currentReservationId = localStorage.getItem("reservationId");
async function checkExistingReservation() {
  if (currentReservationId) {
    const response = await fetch(`/reservation/available?reservationId=${currentReservationId}`);
    if (!response.ok) {
      localStorage.removeItem("reservationId");
      document.getElementById("message").textContent = "Your previous reservation has expired.";
      document.getElementById("reserveBtn").hidden = false;
      document.getElementById("confirmBtn").hidden = true;
      document.getElementById("cancelBtn").hidden = true;
      return;
    }
  
    document.getElementById("message").textContent = `You have a pending reservation. Reservation ID: ${currentReservationId}`;
    document.getElementById("reserveBtn").hidden = true;
    document.getElementById("confirmBtn").hidden = false;
    document.getElementById("cancelBtn").hidden = false;
  }
}

checkExistingReservation();

async function fetchStatus() {
  const response = await fetch(apiUrl);
  const data = await response.json();
  document.getElementById("status").textContent = `Tickets Available: ${data.available}`;
}

setInterval(fetchStatus, 5000);
fetchStatus();

const messageEl = document.getElementById("message");
const reserveBtn = document.getElementById("reserveBtn");
const confirmBtn = document.getElementById("confirmBtn");
const cancelBtn = document.getElementById("cancelBtn");


reserveBtn.addEventListener("click", async () => {
  fetchStatus();
  const response = await fetch("/reserve", { method: "POST" });
  const data = await response.json();

  if (response.ok) {
    messageEl.textContent = `${data.message}. Reservation ID: ${data.reservationId}`;
    localStorage.setItem("reservationId", data.reservationId);
    reserveBtn.hidden = true;
    confirmBtn.hidden = false;
    cancelBtn.hidden = false;
  } else {
    messageEl.textContent = data.message;
  }
});

confirmBtn.addEventListener("click", async () => {
  const reservationId = localStorage.getItem("reservationId");
  const response = await fetch("/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId })
  });
  const data = await response.json();

  if (response.ok) {
    messageEl.textContent = data.message;
    localStorage.removeItem("reservationId");
    reserveBtn.hidden = false;
    confirmBtn.hidden = true;
    cancelBtn.hidden = true;
  } else {
    messageEl.textContent = data.message;
  }
  fetchStatus();
});

cancelBtn.addEventListener("click", async () => {
  const reservationId = localStorage.getItem("reservationId");
  const response = await fetch("/cancel", { method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reservationId })
  });
  const data = await response.json();

  if (response.ok) {
    messageEl.textContent = data.message;
    localStorage.removeItem("reservationId");
    reserveBtn.hidden = false;
    confirmBtn.hidden = true;
    cancelBtn.hidden = true;
  } else {
    messageEl.textContent = data.message;
  }
  fetchStatus();
});