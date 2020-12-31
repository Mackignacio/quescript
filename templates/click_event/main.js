const data = $$().createData({
  message: "to QueryScript",
  test: "from Data",
});

$$("#app", {
  data,
  methods: {
    updateMessage: function (text) {
      this.message = text;
    },
  },
});
