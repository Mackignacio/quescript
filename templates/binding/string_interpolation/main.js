const data = $$().createData({
  message: "to QueryScript",
});

$$("#app", { data });

setTimeout(() => {
  data.message = "from SPA";
}, 2000);
